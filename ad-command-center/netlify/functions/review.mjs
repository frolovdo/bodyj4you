// Hypothesis pulse review: GET returns the last review (rebuilt when older than 6 hours), POST rebuilds it now (the button).
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk } from '../lib/auth.mjs';
import { audit } from '../lib/supabase.mjs';
import { buildReview, cachedReview } from '../lib/pulse.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  try {
    if (req.method === 'GET') {
      const c = await cachedReview();
      if (c) return json({ ok: true, ...c });
      return json({ ok: true, ...(await buildReview()) });
    }
    const f = await body(req);
    if (!csrfOk(u, req, f)) return err('bad request', 403);
    const r = await buildReview();
    await audit(u, 'hypothesis_review', '', `${r.items.length} change sets`);
    return json({ ok: true, ...r });
  } catch (ex) {
    return json({ ok: false, error: String(ex.message || ex).slice(0, 300) });
  }
};
