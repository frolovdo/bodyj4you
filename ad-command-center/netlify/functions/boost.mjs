// Budget boost page: the hourly robot's latest check (dataset ACCOUNT/boost, written on the Mac by adsops/ac_boost.py every
// hour at :15). Read-only here; the robot's mode (shadow / live) and its thresholds live in sp-api/intel/_shared/boost.json.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const d = await dataset('boost', 'ACCOUNT');
  if (!d?.payload) return json({ ok: true, boost: null });
  return json({ ok: true, boost: d.payload, produced_at: d.produced_at, now: new Date().toISOString() });
};
