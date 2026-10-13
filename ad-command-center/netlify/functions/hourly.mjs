// Hourly page: the reading per campaign from the model, the schedule state, and switching the schedule on or off.
// On: saves multipliers plus the base bids read live now (the hourly job moves bids from those). Off: puts every base bid back now.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { db, dataset, audit, FAMILY } from '../lib/supabase.mjs';
import { family, liveState, ptStamp } from '../lib/engine.mjs';
import { applySchedule } from '../lib/daypart.mjs';

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  if (req.method === 'GET') {
    const [d, { data: s }] = await Promise.all([dataset('hourly_model'), db().from('schedules').select('*').eq('family', FAMILY()).maybeSingle()]);
    return json({ ok: true, model: d?.payload || null, produced_at: d?.produced_at || null, schedule: s || { enabled: false }, can_send: can(u, 'approver') });
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'approver')) return err('your role cannot change the schedule', 403);
  try {
    if (f.do === 'preview' || f.do === 'enable') {
      const camps = await buildSchedule(f);
      if (f.do === 'preview') return json({ changes: describe(camps), hyps: {}, checks: [
        { name: 'kill_switch', level: 'ok', detail: 'the hourly job stops whenever Stop all sending is on' },
        { name: 'floors', level: 'ok', detail: 'rank campaigns never go below 85% of base and never under the charter floor bid' },
        { name: 'restore', level: 'ok', detail: 'switching off restores every base bid in one send' }] });
      const row = { family: FAMILY(), enabled: true, by_user: u.name, at: new Date().toISOString(), campaigns: camps, restored_at: null };
      const { error } = await db().from('schedules').upsert(row);
      if (error) throw error;
      await audit(u, 'daypart_on', '', Object.values(camps).map((c) => c.name).join(', '));
      return json({ ok: true, msg: `Schedule on for ${Object.keys(camps).length} campaign(s). The first bid move happens at the top of the next hour.` });
    }
    if (f.do === 'disable') {
      const r = await applySchedule('restore');
      await db().from('schedules').update({ enabled: false, restored_at: new Date().toISOString(), last_run_note: r.note }).eq('family', FAMILY());
      await audit(u, 'daypart_off', '', r.note);
      return json({ ok: true, msg: 'Schedule off. ' + r.note });
    }
    return err('unknown action');
  } catch (ex) {
    return json({ ok: false, error: String(ex.message || ex) });
  }
};

function describe(camps) {
  const h = (x) => (x === 0 || x === 24 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x}am` : `${x - 12}pm`);
  const spans = (hs) => { if (!hs.length) return 'never'; const out = []; let a = hs[0], p = hs[0]; for (const x of [...hs.slice(1), null]) { if (x !== null && x === p + 1) { p = x; continue; } out.push(`${h(a)}-${h(p + 1)}`); if (x !== null) a = p = x; } return out.join(', '); };
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Object.values(camps).map((c) => {
    const dims = Object.entries(c.hours).filter(([, m]) => m < 1).map(([k]) => +k).sort((a, b) => a - b);
    const boosts = Object.entries(c.hours).filter(([, m]) => m > 1).map(([k]) => +k).sort((a, b) => a - b);
    const days = Object.entries(c.days).filter(([, m]) => m !== 1).map(([d, m]) => `${WD[+d]} ${m > 1 ? '+' : ''}${Math.round(100 * (m - 1))}%`).join(', ') || 'flat';
    return `${c.name}: ${Object.keys(c.base).length} bids follow the schedule; smaller bid ${spans(dims)}; bigger bid ${spans(boosts)}; days ${days}`;
  });
}

async function buildSchedule(f) {
  const d = await dataset('hourly_model');
  if (!d) throw new Error('hourly model not pushed yet');
  const fam = await family();
  const live = await liveState(fam);
  const BLOCKS = [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];
  const camps = {};
  for (const x of d.payload.campaigns) {
    if (f['dp_' + x.id] !== '1' && f['dp_' + x.id] !== 1 && f['dp_' + x.id] !== true) continue;
    const hours = { ...x.hours }, days = { ...x.daysm };
    BLOCKS.forEach(([a, b], i) => { const v = (f[`hb_${x.id}_${i}`] ?? '').toString().trim(); if (v !== '') { let m = Math.max(0.5, Math.min(1.5, 1 + parseFloat(v) / 100)); if (x.rank) m = Math.max(0.85, m); for (let h = a; h < b; h++) hours[h] = m; } });
    for (let i = 0; i < 7; i++) { const v = (f[`hd_${x.id}_${i}`] ?? '').toString().trim(); if (v !== '') days[i] = Math.max(0.7, Math.min(1.3, 1 + parseFloat(v) / 100)); }
    if (!Object.values(hours).some((m) => m !== 1) && !Object.values(days).some((m) => m !== 1)) continue;
    const base = {};
    for (const k of live.state.keywords) if (k.campaignId === x.id && k.state === 'ENABLED' && k.bid) base['kw:' + k.keywordId] = parseFloat(k.bid);
    for (const t of live.state.targets || []) if (t.campaignId === x.id && t.state === 'ENABLED' && t.bid) base['tg:' + t.targetId] = parseFloat(t.bid);
    camps[x.id] = { name: x.name, hours, days, base, rank: x.rank, reasons: x.reasons.map((r) => r.text), expected: { cost_day: x.d_cost, orders_day: x.d_ord }, saved_at: ptStamp() };
  }
  if (!Object.keys(camps).length) throw new Error('tick at least one campaign with a non-zero box');
  return camps;
}
