import { json, err, body, setCookie } from '../lib/http.mjs';
import { userByPin, locked, noteLogin, createSession, SESSION_SECS } from '../lib/auth.mjs';
import { audit } from '../lib/supabase.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const f = await body(req);
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || '';
  if (await locked()) return err('Too many wrong PINs. Try again in 15 minutes.', 429);
  const u = await userByPin(f.pin || '');
  await noteLogin(!!u, ip);
  if (!u) { await audit(null, 'login_failed', '', ip); return err('Wrong PIN.', 401); }
  const s = await createSession(u);
  return json({ ok: true, user: { name: u.name, role: u.role }, csrf: s.csrf }, 200, { 'set-cookie': setCookie('ac', s.token, SESSION_SECS) });
};
