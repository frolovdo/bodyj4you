// The live block at the top of the Dashboard: what happened yesterday and today so far, per campaign, straight from the Marketing
// Stream (hourly) and from Amazon itself (budget usage now, in-budget / out-of-budget events), plus the alarms that need a person now.
// Every number here is provisional by design: traffic lands within an hour or two, orders keep filling in for days. The page says so.
// Thresholds are plain common sense to start with and live in RULES so they can be tuned without touching the logic.
import { db, dataset, putDataset, FAMILY } from './supabase.mjs';
import { ads, spList, sbCampaigns } from './ads.mjs';
import { family, nowPT, ptStamp, ptDate } from './engine.mjs';
import { hourlyRows, foldDays } from './stream.mjs';

export const RULES = {
  spend_stop_min_usual: 2,   // $ usually spent by this hour before "nothing spent today" fires
  spend_drop_pct: 60,        // yesterday's spend down this much against the 7-day average
  spend_drop_min_usual: 5,   // ...only for campaigns that usually spend at least $5 a day
  cpc_jump_pct: 40,          // cost per click up this much against the 7-day average
  cpc_min_clicks: 8,         // ...with at least this many clicks, or it is noise
  imp_drop_pct: 45,          // impressions down this much (losing placements) on a day the budget did not run out
  imp_min_usual: 300,
  oob_early_hour: 18,        // out of budget before this hour (PT) counts as early
  inbudget_share_drop: 0.25, // in-budget share of the day fell by this much against the 7-day average
  pace_ratio: 1.6,           // budget used / share of the day gone: above this it will not last the day
  watch_hours: 72,           // a campaign changed within this many hours stays on the watch list
  stream_stale_h: 4,         // the hourly feed is normally 1 to 2 hours behind; beyond this it is a problem
  cache_minutes: 10,
};

const PT_MS = -7 * 3600 * 1000;
const dstr = (d) => d.toISOString().slice(0, 10);
export const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return dstr(d); };
export const toPT = (iso) => new Date(new Date(iso).getTime() + PT_MS);  // a Date whose UTC fields read as Pacific time
export const keyOf = (date, hour) => `${date} ${String(hour).padStart(2, '0')}`;
const shiftKey = (key, days) => keyOf(addDays(key.slice(0, 10), days), +key.slice(11));
export const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
export const pct = (a, b) => (b ? Math.round((100 * (a - b)) / b) : null);
export const cpcOf = (t) => (t.clk ? t.cost / t.clk : null);
export const acosOf = (t) => (t.sales ? (100 * t.cost) / t.sales : null);
const Z = () => ({ imp: 0, clk: 0, cost: 0, orders: 0, sales: 0 });
const n0 = (x) => Math.round(x || 0).toLocaleString('en-US');
const hhmm = (d) => d.toISOString().slice(11, 16);
/** '13:25' -> '1:25pm', '00:07' -> '12:07am'; used for every time a person reads. */
export const clock = (t) => { if (!t) return t; const m = /^(\d{1,2}):(\d{2})$/.exec(String(t)); if (!m) return t; const h = +m[1]; return `${h % 12 || 12}:${m[2]}${h < 12 ? 'am' : 'pm'}`; };
let _today = null, _yday = null;  // set in buildLive for whenPT
const whenPT = (d) => { const ds = dstr(d); return `${ds === _today ? 'today' : ds === _yday ? 'yesterday' : ds.slice(5)} ${clock(hhmm(d))}`; };
const hourWord = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** Sum of the hours between two 'YYYY-MM-DD HH' keys (inclusive) for one campaign's day map. */
export function sumWindow(dm, fromKey, toKey) {
  const t = Z();
  if (!dm) return t;
  for (const [date, d] of Object.entries(dm)) {
    if (date < fromKey.slice(0, 10) || date > toKey.slice(0, 10)) continue;
    for (const [h, v] of Object.entries(d.byHour)) {
      const k = keyOf(date, +h);
      if (k < fromKey || k > toKey) continue;
      t.imp += v.imp; t.clk += v.clk; t.cost += v.cost; t.orders += v.orders; t.sales += v.sales;
    }
  }
  return t;
}
/** The same clock-hours averaged over the n days before: what "usual" means everywhere on the page. */
export function usualWindow(dm, fromKey, toKey, n = 7) {
  const acc = Z();
  for (let j = 1; j <= n; j++) { const s = sumWindow(dm, shiftKey(fromKey, -j), shiftKey(toKey, -j)); for (const k in acc) acc[k] += s[k]; }
  for (const k in acc) acc[k] /= n;
  return acc;
}
export const dayTotals = (dm, date) => { const d = dm?.[date]; return d ? { imp: d.imp, clk: d.clk, cost: d.cost, orders: d.orders, sales: d.sales } : Z(); };
export const avgDays = (dm, dates) => { const a = Z(); for (const d of dates) { const t = dayTotals(dm, d); for (const k in a) a[k] += t[k]; } for (const k in a) a[k] /= dates.length || 1; return a; };

/** Amazon's own record of a campaign leaving and re-entering budget (change history, CAMPAIGN / IN_BUDGET). */
export async function inBudgetEvents(ids, days) {
  const now = Date.now(), from = now - days * 86400000;
  const events = [];
  for (let i = 0; i < ids.length; i += 10) {
    let off = 0;
    for (;;) {
      const r = await ads('POST', '/history', { body: { fromDate: from, toDate: now, eventTypes: { CAMPAIGN: { eventTypeIds: ids.slice(i, i + 10) } }, count: 200, pageOffset: off, sort: { key: 'DATE', direction: 'ASC' } } });
      const ev = r.events || [];
      events.push(...ev);
      if (ev.length < 200) break;
      off += 200;
    }
  }
  return events.filter((e) => e.changeType === 'IN_BUDGET')
    .map((e) => ({ cid: String(e.metadata?.campaignId || e.entityId), t: new Date(+e.timestamp + PT_MS), inBudget: String(e.newValue).toLowerCase() === 'true' }))
    .sort((a, b) => a.t - b.t);
}

/** Per PT date: hours out of budget, the first time it ran out, and whether it is out right now. */
export function budgetSpans(evs, cid) {
  const out = {};
  let outSince = null;
  // The daily budget resets at midnight Pacific, so an out-of-budget span ends at midnight whatever Amazon's log says: the
  // "back in budget" event is written 2 to 40 minutes after the reset (seen 00:01 to 00:36). A span is credited to the day it
  // started only; nothing carries into the next day. A campaign truly out after the reset gets a fresh "out" event anyway.
  const credit = (a, b) => {
    const dayEnd = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate() + 1));
    const y = b < dayEnd ? b : dayEnd;
    const o = (out[dstr(a)] ||= { hoursOut: 0, firstOut: null });
    o.hoursOut += Math.max(0, (y - a) / 3600000);
    if (!o.firstOut) o.firstOut = hhmm(a);
  };
  for (const e of evs) {
    if (e.cid !== cid) continue;
    if (!e.inBudget && !outSince) outSince = e.t;
    else if (e.inBudget && outSince) { credit(outSince, e.t); outSince = null; }
  }
  if (outSince) {
    const n = nowPT();
    credit(outSince, n);
    if (dstr(outSince) === dstr(n)) { const o = out[dstr(n)]; o.stillOut = true; o.outSince = hhmm(outSince); }  // out since before midnight: the reset ended it
  }
  return out;
}

async function budgetUsage(spIds, sbIds = []) {
  // Amazon reports budget usage per ad type: product ads and banner (Sponsored Brands) campaigns have separate endpoints
  const u = {}, errors = [];
  for (const [path, list] of [['/sp/campaigns/budget/usage', spIds], ['/sb/campaigns/budget/usage', sbIds]]) {
    if (!list.length) continue;
    try {
      const r = await ads('POST', path, { body: { campaignIds: list } });
      for (const x of r.success || []) u[String(x.campaignId)] = { pct: x.budgetUsagePercent, budget: x.budget, at: x.usageUpdatedTimestamp };
    } catch (ex) { errors.push(String(ex.message || ex).slice(0, 160)); }
  }
  return errors.length ? { usage: u, error: errors.join('; ') } : { usage: u };
}

/** Sends in the last `hours` grouped into batches (one per queue item, or per minute for Mac-era rows). */
export async function recentSends(hours) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data: logs } = await db().from('applied_log').select('at, item_id, campaign, change, status, error').gte('at', since).order('at');
  const ids = [...new Set((logs || []).map((l) => l.item_id).filter(Boolean))];
  const { data: items } = ids.length ? await db().from('queue_items').select('id, proposed_by, approver, title, status').in('id', ids) : { data: [] };
  const who = Object.fromEntries((items || []).map((i) => [i.id, i.approver && i.approver !== i.proposed_by ? `${i.proposed_by} (approved by ${i.approver})` : i.proposed_by]));
  const by = {};
  for (const l of logs || []) {
    const k = l.item_id || 'cli:' + l.at.slice(0, 16);
    const b = (by[k] ||= { id: l.item_id, at: l.at, who: who[l.item_id] || 'owner, via the engine', campaigns: {}, ok: 0, failed: 0, already: 0, errors: [] });
    if (l.status === 'OK') { b.ok++; (b.campaigns[l.campaign] ||= []).push(l.change); }
    else if (l.status === 'ALREADY' || /duplicateValueError|already exists/i.test(l.error || '')) b.already++;
    else { b.failed++; b.errors.push(`${l.campaign}: ${l.change}`); }
  }
  return Object.values(by).sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function buildLive() {
  const fam = await family();
  const camps = fam.managed.campaigns;
  const ids = Object.keys(camps);
  const sp = ids.filter((c) => (camps[c].type || 'SP') === 'SP');
  const sb = ids.filter((c) => (camps[c].type || 'SP') === 'SB');
  const now = nowPT(), today = ptDate(), hourNow = now.getUTCHours(), minuteNow = now.getUTCMinutes();
  const yday = addDays(today, -1), d2 = addDays(today, -2);
  _today = today; _yday = yday;
  const base = Array.from({ length: 7 }, (_, i) => addDays(today, -2 - i));  // the 7 days before yesterday
  const from = addDays(today, -16);

  const [streamR, usageR, evR, liveR, sends, dpR, killR, rsR, schR, modelR] = await Promise.allSettled([
    hourlyRows(ids, from),
    budgetUsage(sp, sb),
    inBudgetEvents(ids, 10),
    Promise.all([spList('/sp/campaigns/list', 'spCampaign', 'campaigns', { campaignIdFilter: { include: sp } }), sb.length ? sbCampaigns(sb) : []]).then(([a, b]) => [...a, ...b]),
    recentSends(RULES.watch_hours),
    db().from('daypart_log').select('at, campaign, status, error').gte('at', new Date(Date.now() - 24 * 3600000).toISOString()),
    dataset('kill_switch', '_system'),
    db().from('refresh_status').select('source, state, failed_at, check_level, check_msg').eq('family', FAMILY()),
    db().from('schedules').select('enabled, last_run_at, last_run_note').eq('family', FAMILY()).maybeSingle(),
    dataset('campaign_model'),
  ]);
  const val = (r, d) => (r.status === 'fulfilled' ? r.value : d);
  const problems = [];
  const stream = val(streamR, null);
  if (!stream) problems.push('hourly feed (Marketing Stream) could not be read: ' + String(streamR.reason?.message || streamR.reason).slice(0, 140));
  const { days, lastTraffic, lastConv } = foldDays(stream || []);
  const usage = val(usageR, { usage: {} });
  if (usage.error) problems.push('budget usage could not be read: ' + usage.error);
  const evs = val(evR, null);
  if (!evs) problems.push('in-budget events could not be read: ' + String(evR.reason?.message || evR.reason).slice(0, 140));
  if (liveR.status !== 'fulfilled') problems.push('campaign settings could not be read from Amazon, so per-campaign alarms are off this time: ' + String(liveR.reason?.message || liveR.reason).slice(0, 140));
  const liveCamps = Object.fromEntries(val(liveR, []).map((c) => [String(c.campaignId), c]));
  const batches = val(sends, []);
  const dpl = val(dpR, { data: [] }).data || [];
  const kill = !!val(killR, null)?.payload?.engaged;
  const rs = val(rsR, { data: [] }).data || [];
  const sch = val(schR, { data: null }).data;
  // importance = share of the family's ad sales over the last 30 matured days (from the reports model; the stream's recent days read low)
  const sales30 = Object.fromEntries((val(modelR, null)?.payload?.campaigns || []).map((c) => [String(c.id), parseFloat(c.k30?.sales || 0)]));
  const salesAll = Object.values(sales30).reduce((x, y) => x + y, 0);

  // how far the feed goes: today through hour H (traffic); if nothing from today yet, H = -1
  const lastTrafficDate = lastTraffic ? lastTraffic.slice(0, 10) : null, lastTrafficHour = lastTraffic ? +lastTraffic.slice(11) : -1;
  const H = lastTrafficDate === today ? lastTrafficHour : -1;
  const feedLagH = lastTraffic ? Math.round(((now - new Date(lastTraffic.replace(' ', 'T') + ':00:00Z')) / 3600000) * 10) / 10 : null;
  const dayFrac = (hourNow + minuteNow / 60) / 24;

  const alerts = [], watch = [];
  const add = (level, kind, campaign, text, detail = '', link = '#/update', headline = '') => alerts.push({ level, kind, campaign, headline: headline || text, text, detail, link });

  // --- system first: these make every other number suspect
  if (kill) add('fire', 'kill', '', 'All sending is stopped (Stop all sending is on)', 'Nothing goes to Amazon, including the hourly bid schedule, until an owner releases it.', '#/dashboard', 'Sending stopped');
  const dpErr = dpl.filter((r) => r.status !== 'OK');
  if (dpErr.length) add('fire', 'hourly_errors', '', `The hourly bid schedule hit ${dpErr.length} error${dpErr.length === 1 ? '' : 's'} in the last 24 hours`, [...new Set(dpErr.map((r) => `${r.campaign}: ${String(r.error || '').slice(0, 80)}`))].slice(0, 4).join('; '), '#/hourly', `Hourly bid job: ${dpErr.length} error${dpErr.length === 1 ? '' : 's'}`);
  if (sch?.enabled && sch.last_run_at && Date.now() - new Date(sch.last_run_at) > 2.5 * 3600000) add('fire', 'hourly_silent', '', `The hourly bid schedule is on but has not run since ${whenPT(toPT(sch.last_run_at))}`, 'Bids may be stuck at an off-hours level. Check the Hourly page or switch the schedule off to put base bids back.', '#/hourly', 'Hourly bid job has gone quiet');
  for (const b of batches) if (b.failed) add('fire', 'send_failed', '', `A send ${whenPT(toPT(b.at))} by ${b.who} had ${b.failed} row${b.failed === 1 ? '' : 's'} fail`, b.errors.slice(0, 3).join('; '), '#/history', `A send failed (${b.failed} row${b.failed === 1 ? '' : 's'})`);
  for (const r of rs) if (r.state === 'failed') add('watch', 'refresh_failed', '', `The engine's last pull of '${r.source}' failed${r.failed_at ? ` (${whenPT(toPT(r.failed_at))})` : ''}; the page below uses the previous good copy`, r.check_msg ? `Last good copy: ${r.check_msg}.` : '', '#/dashboard', `Engine pull failed: ${r.source}`);
  if (feedLagH != null && feedLagH > RULES.stream_stale_h) add('watch', 'feed_stale', '', `The hourly feed is ${feedLagH} hours behind (newest hour ${lastTraffic ? whenPT(new Date(lastTraffic.replace(' ', 'T') + ':00:00Z')) : '–'})`, 'Today-so-far numbers below are older than they look; yesterday is still complete.', '#/dashboard', `Hourly feed ${feedLagH} h behind`);
  for (const p of problems) add('watch', 'source', '', p, '', '#/dashboard', p.split(':')[0]);

  // --- per campaign
  const rows = [], todayRows = [], issues = {}, spansOf = {};
  const tot = { y: Z(), p: Z(), b: Z(), t: Z(), tu: Z() };
  for (const cid of ids) {
    const m = camps[cid], name = m.name, isSP = (m.type || 'SP') === 'SP';
    const dm = days[cid];
    const y = dayTotals(dm, yday), p = dayTotals(dm, d2), b = avgDays(dm, base);
    const lc = liveCamps[cid];
    const state = lc?.state || (isSP ? 'unknown' : 'ENABLED');
    const budget = lc ? parseFloat(lc.budget?.budget ?? lc.budget ?? 0) : null;  // product ads: budget.budget; banner: budget
    const u = usage.usage[cid];
    const spans = evs ? budgetSpans(evs, cid) : {};
    const ySpan = spans[yday] || { hoursOut: 0, firstOut: null }, tSpan = spans[today] || { hoursOut: 0, firstOut: null };
    const baseShare = evs ? base.reduce((s, d) => s + (1 - Math.min(24, spans[d]?.hoursOut || 0) / 24), 0) / base.length : null;
    const yShare = evs ? 1 - Math.min(24, ySpan.hoursOut) / 24 : null;
    const t = H >= 0 ? sumWindow(dm, keyOf(today, 0), keyOf(today, H)) : Z();
    const tu = H >= 0 ? usualWindow(dm, keyOf(today, 0), keyOf(today, H)) : Z();
    for (const k in tot.y) { tot.y[k] += y[k]; tot.p[k] += p[k]; tot.b[k] += b[k]; tot.t[k] += t[k]; tot.tu[k] += tu[k]; }
    const usedY = budget ? Math.round((100 * y.cost) / budget) : null;
    rows.push({ cid, name, type: isSP ? 'SP' : 'SB', job: m.job || '', state, budget, share30: salesAll ? Math.round((100 * (sales30[cid] || 0)) / salesAll) : null, spend: r2(y.cost), clicks: y.clk, cpc: r2(cpcOf(y)), imp: y.imp, orders: y.orders, sales: r2(y.sales), acos: r2(acosOf(y)),
      usedPct: usedY, outAt: ySpan.firstOut, hoursOut: r2(ySpan.hoursOut),
      vs: { spend: pct(y.cost, b.cost), clicks: pct(y.clk, b.clk), cpc: pct(cpcOf(y), cpcOf(b)), imp: pct(y.imp, b.imp), orders: pct(y.orders, b.orders), sales: pct(y.sales, b.sales) },
      prev: { spend: r2(p.cost), clicks: p.clk, cpc: r2(cpcOf(p)), orders: p.orders, acos: r2(acosOf(p)) },
      base: { spend: r2(b.cost), clicks: r2(b.clk), cpc: r2(cpcOf(b)), imp: Math.round(b.imp), orders: r2(b.orders), sales: r2(b.sales), acos: r2(acosOf(b)), outAt: evs ? base.map((d) => spans[d]?.firstOut).filter(Boolean).sort()[Math.floor(base.filter((d) => spans[d]?.firstOut).length / 2)] || null : null, inShare: baseShare == null ? null : Math.round(100 * baseShare) } });
    todayRows.push({ cid, name, spent: r2(t.cost), usual: r2(tu.cost), clicks: t.clk, usualClicks: r2(tu.clk), cpc: r2(cpcOf(t)), usualCpc: r2(cpcOf(tu)), orders: t.orders, usedPct: u?.pct ?? null, usedAt: u?.at || null, outNow: !!tSpan.stillOut, outSince: tSpan.outSince || tSpan.firstOut || null, budget, state });

    if (state !== 'ENABLED') continue;  // paused campaigns raise nothing
    spansOf[name] = spans;
    const why = (level, kind, short, reason, detail, link = '#/update') => (issues[name] ||= []).push({ level, kind, short, reason, detail, link });
    const bc = cpcOf(b), yc = cpcOf(y), tc = cpcOf(t), tuc = cpcOf(tu);
    const spendCollapsed = b.cost >= RULES.spend_drop_min_usual && y.cost <= b.cost * (1 - RULES.spend_drop_pct / 100);
    // nothing spent today although it usually has by now
    if (H >= 0 && t.cost === 0 && tu.cost >= RULES.spend_stop_min_usual) why('fire', 'spend_stop', `$0 spent today by ${hourWord(H + 1)}, usually $${r2(tu.cost)}`, `nothing spent today up to ${hourWord(H + 1)}, usually about $${r2(tu.cost)} by then`, tu.clk >= 1 ? `Usually ${Math.round(tu.clk)} clicks by this hour. If the budget is not gone and bids were not cut, something else turned it off: check the campaign and ad group on Amazon.` : '');
    // yesterday's spend collapsed
    if (spendCollapsed) why('fire', 'spend_drop', `spent $${r2(y.cost)} yesterday, usually $${r2(b.cost)}`, `spent $${r2(y.cost)} yesterday, usually $${r2(b.cost)} (${pct(y.cost, b.cost)}%)`, y.imp && b.imp ? `Shown ${pct(y.imp, b.imp)}%, clicks ${pct(y.clk, b.clk)}%: ${y.imp <= b.imp * 0.6 ? 'it was shown far less (outbid or lost placements)' : 'it was shown but clicked less'}.` : '');
    // cost per click jumping
    if (bc && yc && y.clk >= RULES.cpc_min_clicks && yc >= bc * (1 + RULES.cpc_jump_pct / 100)) why('fire', 'cpc_jump', `cost per click $${r2(yc)}, usually $${r2(bc)}`, `cost per click $${r2(yc)} yesterday, usually $${r2(bc)} (+${pct(yc, bc)}%) over ${y.clk} clicks`, 'Either bids were raised here, or others are bidding up. Check bids before the budget goes on fewer clicks.');
    else if (tuc && tc && t.clk >= RULES.cpc_min_clicks && tc >= tuc * (1 + RULES.cpc_jump_pct / 100 + 0.1)) why('fire', 'cpc_jump_today', `cost per click $${r2(tc)} today, usually $${r2(tuc)}`, `cost per click $${r2(tc)} so far today, usually $${r2(tuc)} for these hours (+${pct(tc, tuc)}%) over ${t.clk} clicks`, '');
    // losing placements: shown much less although the budget did not run out
    if (b.imp >= RULES.imp_min_usual && y.imp <= b.imp * (1 - RULES.imp_drop_pct / 100) && ySpan.hoursOut < 1 && !spendCollapsed)
      why('fire', 'imp_drop', `shown ${n0(y.imp)} times, usually ${n0(b.imp)}`, `shown ${-pct(y.imp, b.imp)}% less yesterday (${y.imp} vs usual ${Math.round(b.imp)} impressions) with budget to spare`, yc && bc && yc > bc ? 'Cost per click is up too, so others bid higher and it is losing placements.' : 'Bids may no longer win the placements it had; uncertain whether competitors moved or Amazon changed the auction.');
    // budget: out now and early, ran out early yesterday, or on pace to run out early today
    const usualOut = rows[rows.length - 1].base.outAt;
    if (u?.pct != null && u.pct >= 98 && hourNow < RULES.oob_early_hour) why('fire', 'oob_now', `out of budget${tSpan.outSince ? ` since ${clock(tSpan.outSince)}` : ' now'}, usually ${usualOut ? `until ${clock(usualOut)}` : 'all day'}`, `out of budget now, ${Math.round(u.pct)}% of $${budget} used${tSpan.outSince ? ` since ${clock(tSpan.outSince)}` : ''}`, `${usualOut ? `It usually lasts until about ${clock(usualOut)}.` : 'It usually lasts the day.'} Raising the budget keeps it on; leaving it means no clicks until midnight.`);
    else if (u?.pct != null && dayFrac > 0.2 && u.pct >= 50 && u.pct / 100 / dayFrac >= RULES.pace_ratio && !tSpan.stillOut) why('watch', 'oob_pace', `${Math.round(u.pct)}% of budget gone by ${clock(`${hourNow}:${String(minuteNow).padStart(2, '0')}`)}`, `${Math.round(u.pct)}% of its $${budget} budget used with ${Math.round(100 * (1 - dayFrac))}% of the day left`, `At this pace it runs out about ${hourWord(Math.min(23, Math.floor((hourNow + minuteNow / 60) / (u.pct / 100))))}.`);
    if (yShare != null && baseShare != null && baseShare - yShare >= RULES.inbudget_share_drop && yShare <= 0.75) why('fire', 'inbudget_drop', `out of budget at ${clock(ySpan.firstOut)} yesterday, usually ${usualOut ? `at ${clock(usualOut)}` : 'lasts all day'}`, `ran out of budget at ${clock(ySpan.firstOut)} yesterday: in budget ${Math.round(100 * yShare)}% of the day, usually ${Math.round(100 * baseShare)}%${usualOut ? ` (usually out about ${clock(usualOut)})` : ' (usually lasts the day)'}`, `It spent $${r2(y.cost)} against usual $${r2(b.cost)}. Something made it spend faster: higher bids, a higher placement boost, or more traffic. Compare with the changes below.`, '#/history');
    // orders stopped (soft, attribution still filling in)
    if (b.orders >= 1.5 && y.orders === 0 && y.clk >= 10) why('watch', 'orders_zero', `0 orders yesterday, usually ${r2(b.orders)}`, `${y.clk} clicks yesterday and no orders yet (usually ${r2(b.orders)} a day)`, 'Orders attribute for days, so this may fill in. If it does not by tomorrow, check the listing, price and stock.');
  }

  // --- watch list: everything changed in the last 72 hours, with how it reads since. One alarm per campaign, from its latest change only.
  const endKey = lastTraffic || keyOf(today, Math.max(0, hourNow - 1));
  const flaggedCamp = new Set();
  for (const b of batches) {
    const t0 = toPT(b.at), t0key = keyOf(dstr(t0), t0.getUTCHours()), t0date = dstr(t0), t0hm = hhmm(t0);
    const hours = Math.max(1, Math.round((new Date(endKey.replace(' ', 'T') + ':59:00Z') - t0) / 3600000));
    const camList = Object.entries(b.campaigns).map(([name, changes]) => {
      const cid = ids.find((c) => camps[c].name === name);
      const dm = cid ? days[cid] : null;
      const s = sumWindow(dm, t0key, endKey), uu = usualWindow(dm, t0key, endKey);
      // hours out of budget since the change (budget explains "shown less" and "spent less" on its own)
      const sp = spansOf[name] || {};
      let outH = 0, outAt = null;
      for (const [d, o] of Object.entries(sp)) { if (d < t0date || d > today) continue; if (d === t0date && o.firstOut && o.firstOut < t0hm) continue; outH += o.hoursOut; if (!outAt && o.firstOut) outAt = `${d === today ? 'today' : d === yday ? 'yesterday' : d.slice(5)} ${clock(o.firstOut)}`; }
      const note = [];
      if (uu.cost >= 1 && s.cost === 0 && hours >= 3) note.push('nothing spent since the change');
      if (cpcOf(s) && cpcOf(uu) && s.clk >= RULES.cpc_min_clicks && cpcOf(s) >= cpcOf(uu) * (1 + RULES.cpc_jump_pct / 100)) note.push(`cost per click $${r2(cpcOf(s))} vs usual $${r2(cpcOf(uu))} (+${pct(cpcOf(s), cpcOf(uu))}%)`);
      if (outH >= 1) note.push(`ran out of budget ${outAt || ''} (${r2(outH)} h without ads)`);
      else if (uu.imp >= 100 && s.imp <= uu.imp * 0.5) note.push(`shown ${-pct(s.imp, uu.imp)}% less`);
      return { name, n: changes.length, changes: changes.slice(0, 6), since: { spend: r2(s.cost), clicks: s.clk, cpc: r2(cpcOf(s)), imp: s.imp, orders: s.orders, sales: r2(s.sales) }, usual: { spend: r2(uu.cost), clicks: r2(uu.clk), cpc: r2(cpcOf(uu)), imp: Math.round(uu.imp), orders: r2(uu.orders), sales: r2(uu.sales) }, outH: r2(outH), flags: note };
    });
    watch.push({ id: b.id, at: t0.toISOString().slice(5, 16).replace('T', ' '), who: b.who, hours, ok: b.ok, already: b.already, failed: b.failed, campaigns: camList });
    for (const c of camList) {
      if (flaggedCamp.has(c.name)) continue;  // batches come newest first: only the latest change of a campaign raises the alarm
      flaggedCamp.add(c.name);
      if (!c.flags.length) continue;
      // the yesterday rules may already say the same thing about this campaign: keep one line, not two
      const have = (issues[c.name] || []).map((i) => i.kind);
      const fresh = c.flags.filter((f) => !((/cost per click/.test(f) && (have.includes('cpc_jump') || have.includes('cpc_jump_today'))) || (/ran out of budget/.test(f) && (have.includes('inbudget_drop') || have.includes('oob_now')))));
      const reason = `changed ${whenPT(t0)} by ${b.who} (${c.n} change${c.n === 1 ? '' : 's'}: ${c.changes.slice(0, 2).join('; ')}${c.n > 2 ? '; …' : ''})${fresh.length ? ': ' + fresh.join(', ') + ' since' : ''}`;
      (issues[c.name] ||= []).push({ level: fresh.length ? 'fire' : 'watch', kind: 'after_change', short: fresh.length ? fresh[0].replace(/ \(\+\d+%\)/, '').replace(/^cost per click \$([\d.]+) vs usual \$([\d.]+)$/, 'cost per click $$$1, usually $$$2').replace(/^ran out of budget (.*?) \(.*$/, 'out of budget $1').replace(/^shown (\d+)% less$/, 'shown $1% less than usual').replace(/^nothing spent since the change$/, '$0 spent since the change') : 'changed lately', reason, detail: `Since the change (${hours} h): $${c.since.spend} spent vs usual $${c.usual.spend} for the same hours, ${c.since.clicks} clicks vs ${c.usual.clicks}, ${c.since.orders} orders vs ${c.usual.orders}. Restore is one button on History.`, link: '#/history' });
    }
  }
  // one alarm per campaign, worst level, reasons joined; campaigns with only an "after change" note and nothing wrong stay off the alarm list
  for (const [name, list] of Object.entries(issues)) {
    const real = list.filter((i) => i.kind !== 'after_change' || i.level === 'fire');
    if (!real.length) continue;
    const level = real.some((i) => i.level === 'fire') ? 'fire' : 'watch';
    const ordered = [...real].sort((a, b) => (a.kind === 'after_change' ? 1 : 0) - (b.kind === 'after_change' ? 1 : 0));
    alerts.push({ level, kind: ordered.map((i) => i.kind).join('+'), campaign: name, headline: `${name.replace(' - AI', '')}: ${ordered.slice(0, 2).map((i) => i.short).join(', ')}${ordered.length > 2 ? ` +${ordered.length - 2}` : ''}`, text: `${name.replace(' - AI', '')}: ${ordered.map((i) => i.reason).join('; ')}`, detail: ordered.map((i) => i.detail).filter(Boolean).join(' '), link: ordered[0].link });
  }

  // rank by contribution to ad sales: 30 matured days from the reports model first, then the stream's 7-day average, then spend
  const rankKey = (r) => (sales30[r.cid] || 0) * 100 + (r.base.sales || 0) * 10 + (r.sales || 0) + (r.base.spend || 0) / 100;
  rows.sort((a, b) => rankKey(b) - rankKey(a));
  const rankPos = Object.fromEntries(rows.map((r, i) => [r.cid, i]));
  todayRows.sort((a, b) => rankPos[a.cid] - rankPos[b.cid]);
  const order = { fire: 0, watch: 1 };
  alerts.sort((a, b) => order[a.level] - order[b.level] || (rankPos[(rows.find((r) => r.name === a.campaign) || {}).cid] ?? 99) - (rankPos[(rows.find((r) => r.name === b.campaign) || {}).cid] ?? 99));
  const totals = (k) => ({ spend: r2(tot[k].cost), clicks: Math.round(tot[k].clk), cpc: r2(cpcOf(tot[k])), imp: Math.round(tot[k].imp), orders: Math.round(tot[k].orders), sales: r2(tot[k].sales), acos: r2(acosOf(tot[k])) });
  const snap = { at: ptStamp(), today, yday, weekday: new Date(yday + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), through_hour: H, last_traffic: lastTraffic, last_conv: lastConv, feed_lag_h: feedLagH,
    alerts, watch, yesterday: rows, totals: { y: totals('y'), p: totals('p'), b: totals('b'), t: totals('t'), tu: totals('tu') }, today_rows: todayRows, problems,
    system: { kill, schedule_on: !!sch?.enabled, schedule_last: sch?.last_run_note || '', hourly_errors_24h: dpErr.length }, rules: RULES };
  try { await putDataset('live_now', snap, { data_through: yday, rows: rows.length }); } catch { /* the page still gets the fresh snapshot */ }
  return snap;
}

export async function cachedLive(maxMinutes = RULES.cache_minutes) {
  const d = await dataset('live_now');
  if (d && Date.now() - new Date(d.produced_at) < maxMinutes * 60000) return { ...d.payload, cached: true, produced_at: d.produced_at };
  return null;
}
