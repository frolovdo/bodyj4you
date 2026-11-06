// "Refresh daily data": queues an engine run in Supabase job_requests; the Mac runner (bodyj4you/automation/local-runner.mjs)
// runs it in ~/sp-api and the engine pushes its results to Supabase. Nothing runs on GitHub.
// GET lists the latest runs (status, Pacific clock, minutes taken, how long the last full run took);
// POST queues one unless a run is already waiting or running, in which case it says so and queues nothing.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { audit, db, FAMILY } from '../lib/supabase.mjs';

const JOBS = { all: 'engine_all', light: 'engine_light' };
const ONLINE_MS = 2 * 60_000;   // the runner checks in every 10 s
const PT = 'America/Los_Angeles';

const ptClock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: PT, hour: 'numeric', minute: '2-digit' }).replace(/\s+/g, '').toLowerCase() : '');
const ptDate = (d) => d.toLocaleDateString('en-CA', { timeZone: PT });  // YYYY-MM-DD in Pacific
// "today 8:41am" / "yesterday 4:30am" / "Oct 14, 4:30am"
function ptWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), day = ptDate(d), today = ptDate(now), yday = ptDate(new Date(now.getTime() - 86400000));
  const word = day === today ? 'today' : day === yday ? 'yesterday' : d.toLocaleDateString('en-US', { timeZone: PT, month: 'short', day: 'numeric' }) + ',';
  return `${word} ${ptClock(iso)}`;
}
// "Oct 18, 11:22am PT": when the engine last pushed the pages online (refresh_status row 'push'). The engine
// writes UTC times without a zone, so a missing zone is read as UTC.
async function lastUpdated() {
  const { data } = await db().from('refresh_status').select('source,ok_at').eq('family', FAMILY()).in('source', ['push', 'budget']);
  const iso = (src) => { const v = (data || []).find((x) => x.source === src)?.ok_at; return v ? (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + 'Z') : null; };
  const fmt = (v) => (v ? `${new Date(v).toLocaleDateString('en-US', { timeZone: PT, month: 'short', day: 'numeric', year: 'numeric' })}, ${ptClock(v)} PT` : '');
  const at = iso('push');
  return { last_updated: at, last_updated_when: fmt(at) };
}
const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
const notDone = (x) => x.status !== 'completed';

async function listRuns() {
  const { data, error } = await db().from('job_requests').select('id,job,status,requested_at,started_at,finished_at,message')
    .in('job', Object.values(JOBS)).order('id', { ascending: false }).limit(50);
  if (error) throw error;
  const runs = (data || []).map((x) => {
    const started = x.started_at || x.requested_at, done = x.status === 'done' || x.status === 'failed';
    return {
      status: done ? 'completed' : x.status === 'running' ? 'in_progress' : 'queued',
      conclusion: done ? (x.status === 'done' ? 'success' : 'failure') : null,
      what: x.job === JOBS.all ? 'all' : 'light', kind: 'by hand', message: x.message, started,
      started_pt: ptClock(started), when: ptWhen(started),
      finished: done ? x.finished_at : null, finished_when: done ? ptWhen(x.finished_at) : '',
      minutes: mins(started, done ? x.finished_at : new Date().toISOString()),
    };
  });
  const good = runs.filter((x) => x.conclusion === 'success' && x.finished);
  const pick = (x) => (x ? { finished: x.finished, when: x.finished_when, minutes: x.minutes } : null);
  const lastFull = good.find((x) => x.what === 'all'), lastLight = good.find((x) => x.what === 'light');
  const { data: seen } = await db().from('job_runners').select('seen_at').contains('jobs', [JOBS.all]).order('seen_at', { ascending: false }).limit(1);
  const runner_online = !!seen?.[0] && Date.now() - new Date(seen[0].seen_at).getTime() < ONLINE_MS;
  return { runs, runner_online, last_full_minutes: lastFull ? lastFull.minutes : null, last_full: pick(lastFull), last_light: pick(lastLight), ...(await lastUpdated()) };
}
const WHATS = { all: 'everything', light: "today's spend and budgets" };

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  if (req.method === 'GET') {
    try { return json({ ok: true, ...(await listRuns()) }); } catch (e) { return json({ ok: true, runs: [], unknown: true }); }
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'analyst')) return err('Your sign-in does not allow starting a refresh.', 403);
  let state;
  try { state = await listRuns(); } catch (e) { return err('Could not check whether a refresh is already running, so nothing was started. Try again in a few minutes.', 502); }
  const busy = state.runs.find(notDone);
  if (busy) {
    const where = busy.status === 'in_progress' ? `running on the Mac (started ${busy.when})` : 'waiting for the Mac';
    return json({ ok: true, started: false, ...state, msg: `A refresh is already ${where}. Nothing new was started. This page updates by itself when it finishes.` });
  }
  const what = f.what === 'light' ? 'light' : 'all';   // only the two kinds the page offers
  const { error } = await db().from('job_requests').insert({ job: JOBS[what], requested_by: u.name || 'ad command center' });
  if (error) return err('The refresh could not be queued. Nothing was started. Try again in a few minutes.', 502);
  await audit(u, what === 'all' ? 'refresh_all' : 'refresh_light', '', what);
  const next = await listRuns().catch(() => state);
  const prev = what === 'all' ? state.last_full : state.last_light;
  const howLong = prev ? `The last one like it took ${prev.minutes || 'under a'} min; this one will likely take about as long.` : 'How long it takes is uncertain until this first run finishes.';
  const offline = state.runner_online ? '' : ' The Mac runner is offline right now, so it will start when the Mac is back.';
  return json({ ok: true, started: true, ...next, msg: `Refreshing ${WHATS[what]} on the Mac. ${howLong}${offline} The pages update by themselves when it finishes.` });
};
