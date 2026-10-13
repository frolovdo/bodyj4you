// The hourly bid mover, shared by the scheduled function and the Hourly page's switch-off.
// run: base x multiplier for the current Pacific hour and weekday; restore: every base bid back. Never under the charter floor bid; never when the kill switch is on.
import { db, dataset, FAMILY } from './supabase.mjs';
import { spState, send } from './ads.mjs';
import { family, nowPT } from './engine.mjs';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function applySchedule(mode) {
  const { data: S } = await db().from('schedules').select('*').eq('family', FAMILY()).maybeSingle();
  if (!S?.campaigns || !Object.keys(S.campaigns).length) return { note: 'no schedule', sent: 0 };
  if (mode === 'run' && !S.enabled) return { note: 'schedule off', sent: 0 };
  const kill = await dataset('kill_switch', '_system');
  if (kill?.payload?.engaged) return { note: 'kill switch on: nothing sent', sent: 0 };
  const fam = await family();
  const floors = Object.values(fam.charter.floors || {});
  const now = nowPT();
  const hour = now.getUTCHours(), wd = (now.getUTCDay() + 6) % 7;
  const ids = Object.keys(S.campaigns);
  const live = await spState(ids);
  const cur = {};
  for (const k of live.keywords) cur['kw:' + k.keywordId] = k;
  for (const t of live.targets || []) cur['tg:' + t.targetId] = t;
  const kws = [], tgs = [], rows = [];
  for (const [cid, c] of Object.entries(S.campaigns)) {
    const mult = mode === 'restore' ? 1 : (parseFloat(c.hours[String(hour)] ?? 1) * parseFloat(c.days[String(wd)] ?? 1));
    let floor = 0.02;
    for (const f of floors) if (f.campaign_name_contains && c.name.includes(f.campaign_name_contains)) floor = Math.max(floor, parseFloat(f.min_bid_exact_head || 0));
    for (const [key, base] of Object.entries(c.base)) {
      const ent = cur[key];
      if (!ent || ent.state !== 'ENABLED') continue;
      const want = Math.round(Math.max(floor, base * mult) * 100) / 100;
      const nowBid = parseFloat(ent.bid || 0);
      if (Math.abs(want - nowBid) < 0.005) continue;
      const [kind, id] = key.split(':');
      (kind === 'kw' ? kws : tgs).push({ [kind === 'kw' ? 'keywordId' : 'targetId']: id, bid: want });
      rows.push({ mode, campaign: c.name, entity: kind, entity_id: id, from_bid: nowBid, to_bid: want, mult: Math.round(mult * 1000) / 1000, status: '', error: '' });
    }
  }
  if (!rows.length) {
    await db().from('schedules').update({ last_run_at: new Date().toISOString(), last_run_note: `${mode}: nothing to change at ${String(hour).padStart(2, '0')}:00 ${WD[wd]}` }).eq('family', FAMILY());
    return { note: `nothing to change at ${String(hour).padStart(2, '0')}:00 ${WD[wd]}`, sent: 0 };
  }
  const res = {};
  for (const [api, items, idk] of [['PUT /sp/keywords', kws, 'keywordId'], ['PUT /sp/targets', tgs, 'targetId']]) {
    if (!items.length) continue;
    try {
      const r = await send(api, items);
      const wrap = api.includes('targets') ? 'targetingClauses' : 'keywords';
      const body = r[wrap] || r;
      for (const s of body.success || []) res[String(s[idk])] = ['OK', ''];
      for (const e of body.error || []) res[String(items[e.index]?.[idk])] = ['ERROR', JSON.stringify(e.errors || e).slice(0, 200)];
    } catch (ex) { for (const it of items) res[String(it[idk])] = ['ERROR', String(ex).slice(0, 200)]; }
  }
  for (const r of rows) { const [st, er] = res[r.entity_id] || ['ERROR', 'no response']; r.status = st; r.error = er; }
  await db().from('daypart_log').insert(rows);
  const bad = rows.filter((r) => r.status !== 'OK').length;
  const note = `${mode} at ${String(hour).padStart(2, '0')}:00 ${WD[wd]}: ${rows.length - bad} bids sent, ${bad} errors`;
  await db().from('schedules').update({ last_run_at: new Date().toISOString(), last_run_note: note }).eq('family', FAMILY());
  return { note, sent: rows.length - bad, errors: bad };
}
