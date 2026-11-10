// Weekly ads report: the calendar-week (Mon-Sun) report page built on the Mac (adsops/report_weekly_v3.py, pushed by
// report_weekly_top10.py --push to dataset <family>/weekly_report). Signed-in users only. Read-only.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, dataset } from '../lib/supabase.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const [d, { data: list }] = await Promise.all([
    dataset('weekly_report').catch(() => null),
    db().from('datasets').select('family, data_through').eq('name', 'weekly_report').order('family'),
  ]);
  return json({ ok: true, html: d?.payload?.html || null, week: d?.payload?.week || null, produced_at: d?.produced_at || null,
    families: (list || []).map((r) => r.family) });
};
