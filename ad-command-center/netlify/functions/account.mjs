import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, dataset } from '../lib/supabase.mjs';

// The "Whole account" page: the daily ads brief (all families, dataset _system/page_brief from ac_daily_brief.py) with a
// way from each finding into the campaign it is about, plus one line per family from the campaign_model datasets.
// A campaign that two families share is sent to the family ranked higher; its numbers count in both families' lines.
export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  return json(await buildAccount());
};

export async function buildAccount() {
  const [{ data: fams }, rank, brief, { data: sets }, model] = await Promise.all([
    db().from('families').select('family, managed'),
    dataset('parent_ranking', '_system').catch(() => null),
    dataset('page_brief', '_system').catch(() => null),
    db().from('datasets').select('family, name, payload, data_through, produced_at').in('name', ['campaign_model', 'suggestions']).neq('family', '_system'),
    dataset('account_model', '_system').catch(() => null),   // ac_account_viz.py: per-ASIN profit vs ad spend, 90-day account series
  ]);
  const label = Object.fromEntries((fams || []).map((r) => [r.family, r.managed?.terms?.label || r.family]));
  const parents = rank?.payload?.parents || [];
  const order = parents.filter((p) => p.family).map((p) => p.family);
  const rankOf = Object.fromEntries(parents.map((p) => [p.family, p]));
  const models = {}, sugg = {};
  for (const s of sets || []) (s.name === 'campaign_model' ? models : sugg)[s.family] = s;

  const families = [...new Set([...order, ...Object.keys(models)])].filter((f) => models[f] || label[f]).map((f) => {
    const m = models[f]?.payload || {};
    const items = sugg[f]?.payload?.items || [];
    return {
      family: f, label: label[f] || f, parent_sku: rankOf[f]?.parent_sku || f, rank: rankOf[f]?.rank || null, sales_30d: rankOf[f]?.sales_30d ?? null,
      five: m.five || null, spent7: m.spent7 ?? null, tbud: m.tbud ?? null, endm: m.endm || null,
      enabled: (m.campaigns || []).filter((c) => c.state === 'ENABLED').length,
      suggestions: items.length, decide: items.filter((i) => !i.set).length,
    };
  });

  // campaign id -> family, and campaign names for matching the brief's text (longest names first)
  const famOf = {}, names = [];
  for (const f of families) for (const c of models[f.family]?.payload?.campaigns || []) {
    if (!famOf[c.id]) { famOf[c.id] = f.family; names.push({ name: c.name, cid: String(c.id), fam: f.family }); }
  }
  names.sort((a, b) => b.name.length - a.name.length);
  const targets = (it) => {
    const out = [];
    const text = `${it.head || ''} ${it.do || ''} ${(it.why || []).join(' ')}`;   // campaigns are often named only in the evidence lines
    if (it.cid && famOf[it.cid]) out.push({ cid: String(it.cid), fam: famOf[it.cid], name: names.find((n) => n.cid === String(it.cid))?.name || '' });
    for (const n of names) if (out.length < 4 && n.name.length >= 6 && text.includes(n.name) && !out.some((o) => o.cid === n.cid)) out.push(n);
    if (!out.length) {
      const f = families.find((x) => [x.label, x.family, x.parent_sku].some((p) => p && (text.startsWith(p + ':') || text.startsWith(p + ' '))));
      if (f) out.push({ fam: f.family, name: '' });
    }
    return out;
  };
  const b = brief?.payload || null;
  const items = (list) => (list || []).map((it) => ({ tone: it.tone, head: it.head, why: it.why || [], do: it.do, impact: it.impact, targets: targets(it) }));
  return {
    ok: true, families,
    brief: b ? { date: b.date, built_at: b.built_at, emailed_at: b.emailed_at, data_through: b.data_through, since: b.since, through: b.through, other: b.other, top: items(b.top), more: items(b.more) } : null,
    produced_at: brief?.produced_at || null,
    model: model?.payload || null,
  };
}
