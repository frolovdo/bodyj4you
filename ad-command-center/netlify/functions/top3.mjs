// Top 3 page: who takes the clicks and purchases on the family's tracked searches, week by week (Brand Analytics top clicked
// ASINs + our Search Query Performance), from dataset <family>/top3 built by the engine (adsops/ac_top3.py). Read-only.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const d = await dataset('top3').catch(() => null);
  return json({ ok: true, model: d?.payload || null, produced_at: d?.produced_at || null, data_through: d?.data_through || null });
};
