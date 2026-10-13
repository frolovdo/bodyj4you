// History: every change set sent (online and, through the bridge, the earlier ones from the Mac), who, what, and whether it can be restored;
// plus the hypotheses with a verdict against the numbers in the model.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, FAMILY, dataset } from '../lib/supabase.mjs';

function verdict(h, k, be) {
  const b0 = h.baseline || {};
  if (h.reverted_at) return ['undone', `restored on ${h.reverted_at.slice(0, 10)}, so there is nothing to judge`];
  if (!k) return ['no data', ''];
  const today = new Date().toISOString().slice(0, 10);
  const early = h.review_on && today < h.review_on;
  const o0 = b0.orders_day_7d || 0, o1 = k.orders / 7, a0 = b0.acos_7d, a1 = k.acos, s0 = b0.spend_day_7d || 0, s1 = k.cost / 7;
  const money = (v) => (v == null ? '-' : '$' + Math.round(v));
  let ok, det;
  if (h.success === 'orders_up') { ok = o1 >= o0 * 1.1; det = `orders/day ${o0.toFixed(1)} -> ${o1.toFixed(1)}`; }
  else if (h.success === 'acos_down') { ok = a1 != null && a0 != null && a1 <= a0 - 3; det = `ad cost per $100 ${money(a0)} -> ${money(a1)}`; }
  else if (h.success === 'spend_up_acos_ok') { ok = s1 >= s0 * 1.1 && (a1 == null || a1 <= be); det = `spend/day ${money(s0)} -> ${money(s1)}, ad cost per $100 ${money(a1)}`; }
  else return ['check rank', 'judge on the rank chart (Dashboard)'];
  if (early) return [`too early (${h.review_on.slice(5)})`, det + ', so far ' + (ok ? 'on track' : 'not yet')];
  return [ok ? 'worked' : 'did not', det];
}

const toPT = (iso) => (iso ? new Date(new Date(iso).getTime() - 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '');

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const fam = FAMILY();
  const [{ data: items }, { data: logs }, { data: backs }, { data: hyps }, M] = await Promise.all([
    db().from('queue_items').select('id, title, status, proposed_by, approver, applied_at, result, hypothesis, lever, undoes').eq('family', fam).in('status', ['applied', 'failed']).order('applied_at', { ascending: false }).limit(60),
    db().from('applied_log').select('at, item_id, campaign, change, status, why').order('at', { ascending: false }).limit(400),
    db().from('backups').select('item_id'),
    db().from('hypotheses').select('*').eq('family', fam).order('at', { ascending: false }).limit(60),
    dataset('campaign_model'),
  ]);
  const hasBackup = new Set((backs || []).map((b) => b.item_id));
  const byItem = {};
  for (const l of logs || []) (byItem[l.item_id || 'cli:' + toPT(l.at)] ||= []).push(l);
  const batches = (items || []).map((it) => {
    const rows = byItem[it.id] || [];
    const ok = rows.filter((r) => r.status === 'OK');
    return { id: it.id, time: toPT(it.applied_at), who: it.approver ? `${it.proposed_by} (approved by ${it.approver})` : it.proposed_by, title: it.title, status: it.status,
      camps: [...new Set(ok.map((r) => r.campaign).filter(Boolean))], changes: ok.map((r) => r.change), ok: ok.length, err: rows.length - ok.length, why: it.hypothesis || rows[0]?.why || '', restorable: hasBackup.has(it.id), undoes: it.undoes };
  });
  // sends made from the Mac before the bridge (no queue item id): group by minute
  for (const [k, rows] of Object.entries(byItem)) if (k.startsWith('cli:')) {
    const ok = rows.filter((r) => r.status === 'OK');
    batches.push({ id: null, time: k.slice(4), who: 'owner, via the engine', title: 'Sent from the Mac', status: 'applied', camps: [...new Set(ok.map((r) => r.campaign))], changes: ok.map((r) => r.change), ok: ok.length, err: rows.length - ok.length, why: rows[0]?.why || '', restorable: false });
  }
  batches.sort((a, b) => (a.time < b.time ? 1 : -1));
  const nowk = Object.fromEntries((M?.payload?.campaigns || []).map((c) => [c.name, c.k0]));
  const be = M?.payload?.be || 51.8;
  const hy = (hyps || []).map((h) => { const [label, detail] = verdict(h, nowk[h.campaign], be); return { ...h, at: toPT(h.at), label, detail }; });
  return json({ ok: true, batches, hypotheses: hy, can_send: ['approver', 'owner'].includes(u.role) });
};
