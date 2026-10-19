// Keywords page: candidates to advertise and to block, from the model the engine pushed, plus Amazon's own keyword ideas. Sending goes through /api/preview and /api/send
// with kadd_<i> / kneg_<i> JSON rows, so the same backup, log, read-back and History apply.
// Also returns what Amazon holds right now (enabled exact keywords and exact negatives in the managed campaigns), so a term that was
// added an hour ago is not offered again before the engine rebuilds the model overnight.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';
import { family, liveState } from '../lib/engine.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const d = await dataset('keywords_model');
  if (!d) return json({ ok: true, model: null });
  let have = { adv: {}, neg: {}, at: null };
  try {
    const fam = await family();
    const live = await liveState(fam);
    const cname = Object.fromEntries(live.state.campaigns.map((c) => [String(c.campaignId), c.name]));
    const norm = (s) => String(s || '').trim().toLowerCase();
    for (const k of live.state.keywords) if (k.state === 'ENABLED' && k.matchType === 'EXACT') have.adv[norm(k.keywordText)] = cname[String(k.campaignId)] || String(k.campaignId);
    for (const n of live.state.negativeKeywords || []) if (n.state === 'ENABLED' && n.matchType === 'NEGATIVE_EXACT') have.neg[`${n.campaignId}|${norm(n.keywordText)}`] = true;
    have.at = live.at;
  } catch (ex) {
    have.error = String(ex.message || ex);  // the page still works from the model; the send step checks again anyway
  }
  const ideas = await dataset('keyword_ideas').catch(() => null);  // Amazon's keyword recommendations, pushed by the engine (ac_kwideas.py)
  return json({ ok: true, model: d.payload, produced_at: d.produced_at, have, ideas: ideas?.payload || null, ideas_at: ideas?.produced_at || null,
    can_send: ['approver', 'owner'].includes(u.role) });
};
