// Stop all sending: a flag every send step checks. Approvers can engage, owners release. GET returns the state.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { db, audit, dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  if (req.method === 'GET') {
    const d = await dataset('kill_switch', '_system');
    return json({ ok: true, engaged: !!d?.payload?.engaged, by: d?.payload?.by || null, at: d?.payload?.at || null });
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (f.do === 'engage' && can(u, 'approver')) {
    await db().from('datasets').upsert({ family: '_system', name: 'kill_switch', payload: { engaged: true, by: u.name, at: new Date().toISOString() }, produced_at: new Date().toISOString() });
    await audit(u, 'kill_engage');
    return json({ ok: true, engaged: true });
  }
  if (f.do === 'release' && can(u, 'owner')) {
    await db().from('datasets').upsert({ family: '_system', name: 'kill_switch', payload: { engaged: false, by: u.name, at: new Date().toISOString() }, produced_at: new Date().toISOString() });
    await audit(u, 'kill_release');
    return json({ ok: true, engaged: false });
  }
  return err('not allowed', 403);
};
