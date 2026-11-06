// "Refresh from Drive": dashboard → this function → Supabase job_requests → the Mac runner
// (automation/local-runner.mjs) regenerates the Miami + China xlsx files. Nothing runs on GitHub.
//
// POST  asks for a reorder run (or returns the one already waiting/running) → { ok, id }
// GET ?id=N  status of that run → { ok, status, message, runner_online }
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY on this Netlify site (same as Ad Command Center).

const JOB = 'reorder';
const ONLINE_MS = 2 * 60_000;   // the runner checks in every 10 s

export default async (req) => {
  const url = Netlify.env.get('SUPABASE_URL'), key = Netlify.env.get('SUPABASE_SERVICE_KEY');
  if (!url || !key) return json({ ok: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY are not set on this Netlify site.' }, 500);
  const sb = async (path, init = {}) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const runnerOnline = async () => {
    const rows = await sb(`job_runners?jobs=cs.{${JOB}}&select=seen_at&order=seen_at.desc&limit=1`);
    return !!rows[0] && Date.now() - new Date(rows[0].seen_at).getTime() < ONLINE_MS;
  };

  try {
    if (req.method === 'GET') {
      const id = parseInt(new URL(req.url).searchParams.get('id'), 10);
      if (!id) return json({ ok: false, error: 'missing id' }, 400);
      const [row] = await sb(`job_requests?id=eq.${id}&job=eq.${JOB}&select=status,message`);
      if (!row) return json({ ok: false, error: 'no such request' }, 404);
      return json({ ok: true, ...row, runner_online: await runnerOnline() }, 200);
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    const [busy] = await sb(`job_requests?job=eq.${JOB}&status=in.(requested,running)&select=id&order=id.desc&limit=1`);
    const id = busy ? busy.id : (await sb('job_requests', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ job: JOB, requested_by: 'reorder dashboard' }) }))[0].id;
    return json({ ok: true, id, already: !!busy, runner_online: await runnerOnline() }, 202);
  } catch (e) {
    return json({ ok: false, error: e.message || String(e) }, 502);
  }
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
