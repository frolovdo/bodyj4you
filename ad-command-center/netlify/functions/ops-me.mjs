import { json } from '../lib/http.mjs';
import { opsSession } from '../lib/opsauth.mjs';

export default async (req) => {
  const s = await opsSession(req);
  if (!s) return json({ ok: false }, 401);
  return json({ ok: true, csrf: s.csrf });
};
