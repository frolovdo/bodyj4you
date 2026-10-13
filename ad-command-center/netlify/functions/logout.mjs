import { json, err, body, setCookie } from '../lib/http.mjs';
import { currentUser, csrfOk, endSession } from '../lib/auth.mjs';
import { audit } from '../lib/supabase.mjs';

export default async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const u = await currentUser(req);
  const f = await body(req);
  if (!u || !csrfOk(u, req, f)) return err('not signed in', 401);
  await endSession(u.token);
  await audit(u, 'logout');
  return json({ ok: true }, 200, { 'set-cookie': setCookie('ac', '', 0) });
};
