// "Refresh all data now": starts the engine run on GitHub Actions (workflow_dispatch). The engine pushes its results to Supabase when done.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { audit } from '../lib/supabase.mjs';

const OWNER = 'frolovdo', REPO = 'bodyj4you-amazon-api', WORKFLOW = 'refresh.yml';  // ~/sp-api is this repo

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  if (req.method === 'GET') {
    const token = Netlify.env.get('GITHUB_TOKEN');
    if (!token) return json({ ok: true, runs: [] });
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=3`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    const d = r.ok ? await r.json() : { workflow_runs: [] };
    return json({ ok: true, runs: (d.workflow_runs || []).map((x) => ({ status: x.status, conclusion: x.conclusion, started: x.run_started_at, url: x.html_url })) });
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'analyst')) return err('your role cannot refresh', 403);
  const token = Netlify.env.get('GITHUB_TOKEN');
  if (!token) return err('GITHUB_TOKEN is not set on this site', 500);
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { what: f.what || 'all' } }) });
  if (r.status !== 204) return err(`GitHub answered ${r.status}: ${(await r.text()).slice(0, 200)}`, 502);
  await audit(u, 'refresh_all', '', f.what || 'all');
  return json({ ok: true, msg: 'Refresh started on the engine. Pages update when it finishes (10 to 30 minutes).' });
};
