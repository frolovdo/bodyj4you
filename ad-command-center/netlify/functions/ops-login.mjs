// Ops page PIN login: 5 wrong PINs in 15 minutes locks it for everyone.
import { json, err, body } from '../lib/http.mjs';
import { pinOk, opsLocked, noteOpsLogin, createOpsSession, opsCookie, OPS_SESSION_SECS } from '../lib/opsauth.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const f = await body(req);
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || '';
  if (await opsLocked()) return err('Too many wrong PINs. Try again in 15 minutes.', 429);
  const ok = await pinOk(f.pin || '');
  await noteOpsLogin(ok, ip);
  if (!ok) return err('Wrong PIN.', 401);
  const s = await createOpsSession();
  return json({ ok: true, csrf: s.csrf }, 200, { 'set-cookie': opsCookie(s.token, OPS_SESSION_SECS) });
};
