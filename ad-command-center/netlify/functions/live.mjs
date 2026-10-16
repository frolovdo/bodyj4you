// Live block for the Dashboard: GET returns the snapshot (re-read when older than RULES.cache_minutes), POST re-reads now (the button).
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk } from '../lib/auth.mjs';
import { audit } from '../lib/supabase.mjs';
import { buildLive, cachedLive } from '../lib/live.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  try {
    if (req.method === 'GET') {
      const c = await cachedLive();
      if (c) return json({ ok: true, ...c });
      return json({ ok: true, ...(await buildLive()) });
    }
    const f = await body(req);
    if (!csrfOk(u, req, f)) return err('bad request', 403);
    const snap = await buildLive();
    await audit(u, 'live_refresh', '', `${snap.alerts.length} alerts`);
    return json({ ok: true, ...snap });
  } catch (ex) {
    return json({ ok: false, error: String(ex.message || ex).slice(0, 300) });
  }
};
