// Keywords page: candidates to advertise and to block, from the model the engine pushed. Sending goes through /api/preview and /api/send
// with kadd_<i> / kneg_<i> JSON rows, so the same backup, log, read-back and History apply.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const d = await dataset('keywords_model');
  if (!d) return json({ ok: true, model: null });
  return json({ ok: true, model: d.payload, produced_at: d.produced_at, can_send: ['approver', 'owner'].includes(u.role) });
};
