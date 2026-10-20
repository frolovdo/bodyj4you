// Scheduled: two minutes past every hour, move the scheduled bids for every family that has a schedule
// (does nothing while a schedule is off or the kill switch is on).
import { applySchedule } from '../lib/daypart.mjs';
import { db, useFamily } from '../lib/supabase.mjs';

export default async () => {
  const { data } = await db().from('schedules').select('family');
  const fams = [...new Set((data || []).map((r) => r.family))];
  const out = {};
  for (const f of fams) {
    useFamily(f);
    try { out[f] = await applySchedule('run'); } catch (e) { out[f] = { note: 'error: ' + e.message }; }
    console.log('daypart-run', f, out[f].note);
  }
  useFamily(null);
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '2 * * * *' };
