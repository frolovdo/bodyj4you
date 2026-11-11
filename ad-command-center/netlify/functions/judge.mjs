// Campaign Judge: this hour's verdict per campaign (dataset <family>/rules_now, written hourly on the Mac by
// adsops/ac_rules.py --push after ac_judge.py). On "Whole account" every family that has one. Signed-in users only. Read-only.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, FAMILY } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const fam = FAMILY();
  let q = db().from('datasets').select('family, payload, produced_at').eq('name', 'rules_now').order('family');
  if (fam !== 'ACCOUNT') q = q.eq('family', fam);
  const { data, error } = await q;
  if (error) return err(error.message, 500);
  const families = (data || []).map((r) => ({ family: r.family, produced_at: r.produced_at, ...r.payload }));
  return json({ ok: true, families });
};
