// Update campaigns: live settings from the Ads API merged with the numbers model the engine pushed.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { family, model, liveState } from '../lib/engine.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  try {
    const fam = await family();
    const [M, live, S] = await Promise.all([model(), liveState(fam), dataset('suggestions').catch(() => null)]);
    const byId = Object.fromEntries(M.campaigns.map((c) => [c.id, c]));
    const sp = live.state.campaigns.map((c) => {
      const m = byId[c.campaignId] || {};
      const pb = Object.fromEntries((c.dynamicBidding?.placementBidding || []).map((p) => [p.placement, p.percentage]));
      const bids = Object.fromEntries([...live.state.keywords.filter((k) => k.campaignId === c.campaignId).map((k) => ['kw_' + k.keywordId, k]), ...(live.state.targets || []).filter((t) => t.campaignId === c.campaignId).map((t) => ['tg_' + t.targetId, t])]);
      return { id: c.campaignId, name: c.name, typ: 'SP', state: c.state, budget: parseFloat(c.budget?.budget || 0), pb,
        keywords: (m.keywords || []).map((k) => ({ ...k, bid: parseFloat(bids['kw_' + k.keywordId]?.bid || 0), live: !!bids['kw_' + k.keywordId] })).filter((k) => k.live),
        targets: (m.targets || []).map((t) => ({ ...t, bid: parseFloat(bids['tg_' + t.targetId]?.bid || 0), live: !!bids['tg_' + t.targetId] })).filter((t) => t.live),
        k0: m.k0, k1: m.k1, k30: m.k30, act7: m.act7, act30: m.act30, new: m.new, early: m.early, job: m.job, rank: m.rank, floors: m.floors };
    });
    const sb = live.banners.map((c) => { const m = byId[c.campaignId] || {}; return { id: c.campaignId, name: c.name, typ: 'SB', state: c.state, budget: parseFloat(c.budget || 0), k0: m.k0, k30: m.k30, act30: m.act30 }; });
    const order = M.campaigns.map((c) => c.id);
    const camps = [...sb, ...sp].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return json({ ok: true, live_at: live.at, model_at: M.built_at, end: M.end, endm: M.endm, be: M.be, tgt: M.tgt, five: M.five, response: M.response, strip: M.strip, charter: M.charter,
      spent7: M.spent7, campaigns: camps, suggestions: S?.payload || null, can_send: ['approver', 'owner'].includes(u.role) });
  } catch (ex) {
    return err(String(ex.message || ex), 502);
  }
};
