// Scheduled: two minutes past every hour, move the scheduled bids (does nothing while the schedule is off or the kill switch is on).
import { applySchedule } from '../lib/daypart.mjs';

export default async () => {
  const r = await applySchedule('run');
  console.log('daypart-run:', r.note);
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '2 * * * *' };
