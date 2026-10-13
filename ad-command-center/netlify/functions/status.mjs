// Refresh status and self-checks, for the Data card.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, FAMILY } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const { data, error } = await db().from('refresh_status').select('*').eq('family', FAMILY()).order('source');
  if (error) return err(error.message, 500);
  return json({ ok: true, rows: data });
};
