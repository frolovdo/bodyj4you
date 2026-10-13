import { json } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return json({ ok: false, user: null }, 401);
  return json({ ok: true, user: { name: u.name, role: u.role }, csrf: u.csrf });
};
