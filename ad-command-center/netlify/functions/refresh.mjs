// "Refresh daily data": starts the engine run on GitHub Actions (workflow_dispatch). The engine pushes its results to
// Supabase when done. GET lists the latest runs (status, Pacific clock, minutes taken, how long the last full run took);
// POST starts one unless a run is already queued or in progress, in which case it says so and starts nothing.
// If GitHub cannot be read, nothing is started either: a blind start is how duplicate runs happened before.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { audit } from '../lib/supabase.mjs';

const OWNER = 'frolovdo', REPO = 'bodyj4you-amazon-api', WORKFLOW = 'refresh.yml';  // ~/sp-api is this repo
const FULL_MIN_MINUTES = 5;  // the run list does not say light or full; light runs take about a minute, so >= 5 min means a full run
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
const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
const notDone = (x) => x.status !== 'completed';

async function listRuns(token) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=50`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`run list ${r.status}`);
  const d = await r.json();
  const runs = (d.workflow_runs || []).map((x) => ({
    status: x.status, conclusion: x.conclusion, started: x.run_started_at, url: x.html_url,
    kind: x.event === 'schedule' ? 'on schedule' : 'by hand',
    started_pt: ptClock(x.run_started_at), when: ptWhen(x.run_started_at),
    finished: x.status === 'completed' ? x.updated_at : null, finished_when: x.status === 'completed' ? ptWhen(x.updated_at) : '',
    minutes: mins(x.run_started_at, x.status === 'completed' ? x.updated_at : new Date().toISOString()),
  }));
  // The two kinds of run, by duration (the run list does not carry the "what" input): full = everything (Amazon reports,
  // ~20 min), light = today's spend and budgets + push (~1 min). Only runs that finished well count as data on the site.
  const good = runs.filter((x) => x.status === 'completed' && x.conclusion === 'success' && x.minutes != null);
  const pick = (x) => (x ? { finished: x.finished, when: x.finished_when, minutes: x.minutes } : null);
  const lastFull = good.find((x) => x.minutes >= FULL_MIN_MINUTES), lastLight = good.find((x) => x.minutes < FULL_MIN_MINUTES);
  return { runs, last_full_minutes: lastFull ? lastFull.minutes : null, last_full: pick(lastFull), last_light: pick(lastLight) };
}
const WHATS = { all: 'everything', light: "today's spend and budgets" };

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const token = Netlify.env.get('GITHUB_TOKEN');
  if (req.method === 'GET') {
    if (!token) return json({ ok: true, runs: [], unknown: true });
    try { return json({ ok: true, ...(await listRuns(token)) }); } catch (e) { return json({ ok: true, runs: [], unknown: true }); }
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'analyst')) return err('Your sign-in does not allow starting a refresh.', 403);
  if (!token) return err('The refresh is not connected on this site, so nothing was started. Ask for help setting it up.', 500);
  let state;
  try { state = await listRuns(token); } catch (e) { return err('Could not check whether a refresh is already running, so nothing was started. Try again in a few minutes.', 502); }
  const busy = state.runs.find(notDone);
  if (busy) {
    const where = busy.status === 'in_progress' ? `running (started ${busy.when}, ${busy.kind})` : 'waiting to start';
    return json({ ok: true, started: false, ...state, msg: `A refresh is already ${where}. Nothing new was started. This page updates by itself when it finishes.` });
  }
  const what = f.what === 'light' ? 'light' : 'all';   // only the two kinds the page offers
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { what } }) });
  if (r.status !== 204) return err('The refresh could not be started (the runner refused). Nothing was started. Try again in a few minutes.', 502);
  await audit(u, what === 'all' ? 'refresh_all' : 'refresh_light', '', what);
  const prev = what === 'all' ? state.last_full : state.last_light;
  const howLong = prev ? `The last one like it took ${prev.minutes || 'under a'} min; this one will likely take about as long.` : 'How long it takes is uncertain until this first run finishes.';
  return json({ ok: true, started: true, ...state, msg: `Refreshing ${WHATS[what]}. ${howLong} The pages update by themselves when it finishes.` });
};
