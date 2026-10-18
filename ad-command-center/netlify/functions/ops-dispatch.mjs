// Ops page "Pull fresh data": Supabase (trigger on ops_refresh insert, via pg_net) calls this with {id}.
// It starts the ops-refresh workflow only for a real, fresh 'requested' row, so the open URL can't do anything else.
import { json, err, body } from '../lib/http.mjs';
import { db } from '../lib/supabase.mjs';

const OWNER = 'frolovdo', REPO = 'bodyj4you-amazon-api', WORKFLOW = 'ops-refresh.yml';  // ~/sp-api is this repo

export default async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const f = await body(req);
  const id = parseInt(f.id, 10);
  if (!id) return err('missing id');
  const { data: row, error } = await db().from('ops_refresh').select('id,status,requested_at').eq('id', id).maybeSingle();
  if (error) return err(error.message, 500);
  if (!row || row.status !== 'requested') return err('no pending request ' + id, 404);
  if (Date.now() - new Date(row.requested_at).getTime() > 10 * 60 * 1000) return err('request too old', 410);
  const token = Netlify.env.get('GITHUB_TOKEN');
  const fail = async (msg) => { await db().from('ops_refresh').update({ status: 'failed', message: msg, finished_at: new Date().toISOString() }).eq('id', id); return err(msg, 502); };
  // Off while GitHub Actions has no free minutes left (2026-10-18); remove this line to turn it back on.
  return fail('Out of credits for manual refresh. Nothing was started.');
  if (!token) return fail('GITHUB_TOKEN is not set on the Netlify site');
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { request_id: String(id) } }) });
  if (r.status !== 204) return fail(`GitHub answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await db().from('ops_refresh').update({ status: 'dispatched', message: 'Started on GitHub' }).eq('id', id).eq('status', 'requested');
  return json({ ok: true });
};
