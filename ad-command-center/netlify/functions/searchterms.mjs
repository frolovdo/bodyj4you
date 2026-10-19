// Search terms page: word patterns that waste money across many searches, and brand searches paid for in non-brand campaigns,
// from the model the engine pushes (adsops/ac_ngrams.py -> dataset searchterms_model). Blocking goes through /api/preview and
// /api/send with kneg_<i> rows carrying matchType NEGATIVE_PHRASE, so the same backup, log, read-back, undo and History apply.
// Also returns the phrase and exact negatives Amazon holds right now per ad group, so a pattern blocked an hour ago is not offered again.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';
import { family, liveState } from '../lib/engine.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const d = await dataset('searchterms_model');
  if (!d) return json({ ok: true, model: null });
  const have = { neg: {}, at: null };
  try {
    const live = await liveState(await family());
    const norm = (s) => String(s || '').trim().toLowerCase();
    for (const n of live.state.negativeKeywords || []) {
      if (n.state !== 'ENABLED') continue;
      const k = `${n.campaignId}|${n.adGroupId}`;
      (have.neg[k] = have.neg[k] || []).push({ text: norm(n.keywordText), phrase: n.matchType === 'NEGATIVE_PHRASE' });
    }
    have.at = live.at;
  } catch (ex) {
    have.error = String(ex.message || ex);  // the page still works from the model; the send step checks again anyway
  }
  return json({ ok: true, model: d.payload, produced_at: d.produced_at, have, can_send: ['approver', 'owner'].includes(u.role) });
};
