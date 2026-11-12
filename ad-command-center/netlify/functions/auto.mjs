// Auto-pilot page of a family run by the daily robot (adsops/ac_auto.py on the Mac, 9:20 Pacific): dataset <family>/auto.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const d = await dataset('auto');
  if (!d?.payload) return json({ ok: true, auto: null });
  return json({ ok: true, auto: d.payload, produced_at: d.produced_at, now: new Date().toISOString() });
};
