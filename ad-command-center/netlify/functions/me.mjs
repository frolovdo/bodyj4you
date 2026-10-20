import { json } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, dataset, FAMILY } from '../lib/supabase.mjs';

// Family picker: the top 10 parent SKUs by 30-day revenue (dataset _system/parent_ranking, from ac_parents.py on the Mac).
// One option per variation family; only families set up in the tool can be opened.
export default async (req) => {
  const u = await currentUser(req);
  if (!u) return json({ ok: false, user: null }, 401);
  const [{ data: fams }, rank] = await Promise.all([db().from('families').select('family, managed').order('family'), dataset('parent_ranking', '_system').catch(() => null)]);
  const byFam = Object.fromEntries((fams || []).map((r) => [r.family, r]));
  const meta = (f) => ({ label: byFam[f]?.managed?.terms?.label || (f === 'EO-ROSEHIP' ? 'Rosehip' : f), head: byFam[f]?.managed?.terms?.head || 'rosehip oil' });
  let families = (rank?.payload?.parents || []).slice(0, 10).map((p) => ({
    rank: p.rank, parent_sku: p.parent_sku, name: p.name, sales_30d: p.sales_30d,
    family: p.family && byFam[p.family] ? p.family : null, ...(p.family ? meta(p.family) : { label: p.parent_sku, head: '' }),
  }));
  if (!families.length) families = (fams || []).map((r) => ({ family: r.family, parent_sku: r.family, ...meta(r.family) }));  // ranking not pushed yet
  return json({ ok: true, user: { name: u.name, role: u.role }, csrf: u.csrf, family: FAMILY(), families, ranking_window: rank?.payload?.window || null });
};
