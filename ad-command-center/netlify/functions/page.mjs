// Phase 0: pages rendered by the engine and pushed into Supabase (datasets name = page_<name>). The app shows them as-is,
// with the time they were produced, so the Dashboard is live online before each page is ported to live functions.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const name = new URL(req.url).searchParams.get('name') || 'dashboard';
  if (!/^[a-z_]+$/.test(name)) return err('bad page name');
  const d = await dataset('page_' + name);
  if (!d) return json({ ok: true, html: null, produced_at: null });
  return json({ ok: true, html: d.payload.html, css: d.payload.css || '', produced_at: d.produced_at, data_through: d.data_through });
};
