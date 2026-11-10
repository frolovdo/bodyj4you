// Today's move for the current family: the engine's one recommended action with its evidence lines, the goal line, the numbers
// for the status line and the watch list (ac_today.py, pushed as dataset today_move). Read-only; the card's button only prefills Update.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  try {
    const d = await dataset('today_move');
    if (!d) return json({ ok: true, today: null, produced_at: null });
    return json({ ok: true, today: d.payload, produced_at: d.produced_at, data_through: d.data_through });
  } catch (ex) {
    return err(String(ex.message || ex), 502);
  }
};
