import { json } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, FAMILY } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return json({ ok: false, user: null }, 401);
  const { data } = await db().from('families').select('family, managed').order('family');
  const families = (data || []).map((r) => ({ family: r.family, label: r.managed?.terms?.label || (r.family === 'EO-ROSEHIP' ? 'Rosehip' : r.family), head: r.managed?.terms?.head || 'rosehip oil' }));
  return json({ ok: true, user: { name: u.name, role: u.role }, csrf: u.csrf, family: FAMILY(), families });
};
