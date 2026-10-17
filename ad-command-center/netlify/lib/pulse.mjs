// Hypothesis pulse: for every change set still inside its review window, a few plain sentences on how it is going so far, written
// from the hourly feed only (since the change vs the same clock-hours over the 7 days before), with the rest of the family as the
// control: if every campaign moved the same way, the change is not the cause. Nothing here guesses; thin data says "uncertain".
import { db, dataset, putDataset, FAMILY } from './supabase.mjs';
import { family, nowPT } from './engine.mjs';
import { hourlyRows, foldDays } from './stream.mjs';
import { addDays, toPT, keyOf, sumWindow, usualWindow, r2, pct, cpcOf, acosOf } from './live.mjs';

const SUCC = { orders_up: 'more orders a day', acos_down: 'a lower ad cost per $100', spend_up_acos_ok: 'more spend at an acceptable ad cost', rank_up: 'a better organic rank' };
const money = (v) => (v == null ? 'n/a' : '$' + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2)));
const signed = (p) => (p == null ? 'n/a' : (p > 0 ? '+' : '') + p + '%');
const dstr = (d) => d.toISOString().slice(0, 10);

export async function buildReview() {
  const fam = await family();
  const camps = fam.managed.campaigns, ids = Object.keys(camps);
  const spIds = ids.filter((c) => (camps[c].type || 'SP') === 'SP');
  const cidOf = Object.fromEntries(ids.map((c) => [camps[c].name, c]));
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: hyps }, M, rsR] = await Promise.all([
    db().from('hypotheses').select('*').eq('family', FAMILY()).gte('at', since).order('at', { ascending: false }),
    dataset('campaign_model'),
    db().from('refresh_status').select('source, check_msg').eq('family', FAMILY()).eq('source', 'rank').maybeSingle(),
  ]);
  const itemIds = [...new Set((hyps || []).map((h) => h.item_id).filter(Boolean))];
  const [{ data: items }, { data: logs }] = await Promise.all([
    itemIds.length ? db().from('queue_items').select('id, title, status, proposed_by, approver, applied_at').in('id', itemIds) : { data: [] },
    itemIds.length ? db().from('applied_log').select('item_id, campaign, change, status').in('item_id', itemIds) : { data: [] },
  ]);
  const item = Object.fromEntries((items || []).map((i) => [i.id, i]));
  const changesOf = {};
  for (const l of logs || []) if (l.status === 'OK') ((changesOf[l.item_id] ||= {})[l.campaign] ||= []).push(l.change);
  const earliest = (hyps || []).reduce((m, h) => (h.at < m ? h.at : m), new Date().toISOString());
  const from = addDays(dstr(toPT(earliest)), -9);
  const rows = ids.length ? await hourlyRows(ids, from) : [];
  const { days, lastTraffic } = foldDays(rows);
  const now = nowPT();
  const endKey = lastTraffic || keyOf(dstr(now), Math.max(0, now.getUTCHours() - 1));
  const be = M?.payload?.be, strip = M?.payload?.strip || {};
  const rankNote = rsR?.data?.check_msg || '';

  const out = [];
  const byItem = {};
  for (const h of hyps || []) (byItem[h.item_id || 'none'] ||= []).push(h);
  for (const [iid, list] of Object.entries(byItem)) {
    const it = item[iid];
    if (it && it.status !== 'applied') continue;
    const touched = new Set(list.map((h) => h.campaign));
    const t0 = toPT(list[0].at), t0key = keyOf(dstr(t0), t0.getUTCHours());
    const hours = Math.max(1, Math.round((new Date(endKey.replace(' ', 'T') + ':59:00Z') - t0) / 3600000));
    const daysIn = Math.round((hours / 24) * 10) / 10;
    // control: the rest of the family's SP campaigns over the same hours
    const ctl = { s: { imp: 0, clk: 0, cost: 0, orders: 0, sales: 0 }, u: { imp: 0, clk: 0, cost: 0, orders: 0, sales: 0 } };
    for (const cid of spIds) {
      if (touched.has(camps[cid].name)) continue;
      const s = sumWindow(days[cid], t0key, endKey), u = usualWindow(days[cid], t0key, endKey);
      for (const k in ctl.s) { ctl.s[k] += s[k]; ctl.u[k] += u[k]; }
    }
    const ctlSpend = pct(ctl.s.cost, ctl.u.cost), ctlClicks = pct(ctl.s.clk, ctl.u.clk), ctlCpc = pct(cpcOf(ctl.s), cpcOf(ctl.u));
    const entries = [];
    for (const h of list) {
      const cid = cidOf[h.campaign];
      const dm = cid ? days[cid] : null;
      const s = sumWindow(dm, t0key, endKey), u = usualWindow(dm, t0key, endKey);
      const perDay = (x) => (hours ? (x * 24) / hours : 0);
      const spendP = pct(s.cost, u.cost), clicksP = pct(s.clk, u.clk), impP = pct(s.imp, u.imp), cpcP = pct(cpcOf(s), cpcOf(u)), ordP = pct(s.orders, u.orders);
      const changes = (changesOf[iid] || {})[h.campaign] || [];
      const sent = [];
      let status = 'too early';
      if (h.reverted_at) { status = 'undone'; sent.push(`This change was put back on ${toPT(h.reverted_at).toISOString().slice(0, 10)}, so there is nothing to judge.`); entries.push({ campaign: h.campaign, hypothesis: h.hypothesis, success: h.success, review_on: h.review_on, status, sentences: sent, facts: null }); continue; }
      sent.push(`${changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} (${changes.slice(0, 3).join('; ')}${changes.length > 3 ? '; …' : ''})` : 'Changed'} on ${t0.toISOString().slice(5, 16).replace('T', ' ')} PT by ${it ? (it.approver && it.approver !== it.proposed_by ? `${it.proposed_by}, approved by ${it.approver}` : it.proposed_by) : h.by_user}. Aim: ${SUCC[h.success] || h.success}. ${daysIn} day${daysIn === 1 ? '' : 's'} in, judge on ${h.review_on || 'the review date'}.`);
      const thin = s.clk < 20;
      const fill = hours < 72 ? ' (orders for the last 3 days are still filling in)' : '';
      sent.push(`Since the change, against the same hours over the 7 days before: spend ${money(s.cost)} vs ${money(u.cost)} (${signed(spendP)}), clicks ${s.clk} vs ${Math.round(u.clk)} (${signed(clicksP)}), shown ${signed(impP)}, cost per click ${money(cpcOf(s))} vs ${money(cpcOf(u))} (${signed(cpcP)}), orders ${s.orders} vs ${r2(u.orders)}${fill}, ad cost per $100 ${acosOf(s) == null ? 'n/a' : money(acosOf(s))} vs ${acosOf(u) == null ? 'n/a' : money(acosOf(u))}.`);
      if (ctl.u.cost > 0) {
        const same = spendP != null && ctlSpend != null && Math.abs(spendP - ctlSpend) < 15 && Math.abs((clicksP ?? 0) - (ctlClicks ?? 0)) < 15;
        sent.push(`Pulse of the rest of the family over the same hours: spend ${signed(ctlSpend)}, clicks ${signed(ctlClicks)}, cost per click ${signed(ctlCpc)}. ${same ? 'This campaign moved with the family, so the change is not clearly the cause.' : 'This campaign moved differently from the family, so the change is showing.'}`);
      }
      let read = '';
      if (h.success === 'orders_up') { const ok = perDay(s.orders) >= perDay(u.orders) * 1.1 && s.orders >= 2; read = hours < 72 ? `Too early for orders${thin ? '; under 20 clicks so far, so uncertain' : ''}. Leading signs: ${clicksP == null ? 'no click history to compare' : clicksP >= 10 ? 'more clicks, which is what orders need first' : clicksP <= -10 ? 'fewer clicks, which works against more orders' : 'clicks about flat'}.` : ok ? 'On track so far: more orders a day than before.' : 'Not yet: orders a day are not up on before.'; status = hours < 72 ? 'too early' : ok ? 'on track' : 'not yet'; }
      else if (h.success === 'acos_down') { const a = acosOf(s), b0 = acosOf(u); const ok = a != null && b0 != null && a <= b0 - 3; read = hours < 72 || a == null ? `Too early: ad cost per $100 needs matured orders${thin ? '; under 20 clicks so far' : ''}. Leading sign: cost per click ${signed(cpcP)}.` : ok ? 'On track so far: ad cost per $100 is lower.' : 'Not yet: ad cost per $100 is not lower.'; status = hours < 72 || a == null ? 'too early' : ok ? 'on track' : 'not yet'; }
      else if (h.success === 'spend_up_acos_ok') { const a = acosOf(s); const ok = spendP != null && spendP >= 10 && (a == null || be == null || a <= be); read = spendP == null ? 'Uncertain: no spend history to compare.' : spendP >= 10 ? (hours < 72 ? `Spend is up ${signed(spendP)}; whether the ad cost holds${be ? ` under $${Math.round(be)} per $100` : ''} shows after orders mature.` : ok ? 'On track: spend is up and the ad cost is acceptable.' : 'Spend is up but the ad cost is above the line.') : `Not yet: spend is ${signed(spendP)}, not up.`; status = spendP == null ? 'uncertain' : spendP >= 10 ? (hours < 72 ? 'too early' : ok ? 'on track' : 'not yet') : 'not yet'; }
      else { read = `Rank is judged on the rank chart: organic rank #${strip.rank ?? 'n/a'} now (best #${strip.rank_best ?? 'n/a'}).${rankNote ? ` ${rankNote}.` : ''} Leading signs here: shown ${signed(impP)}, clicks ${signed(clicksP)}.`; status = 'check rank'; }
      sent.push(read + (thin && status !== 'too early' ? ' Under 20 clicks since the change, so uncertain.' : ''));
      entries.push({ campaign: h.campaign, hypothesis: h.hypothesis, success: h.success, review_on: h.review_on, status, sentences: sent,
        facts: { hours, since: { spend: r2(s.cost), clicks: s.clk, imp: s.imp, cpc: r2(cpcOf(s)), orders: s.orders, sales: r2(s.sales), acos: r2(acosOf(s)) }, usual: { spend: r2(u.cost), clicks: r2(u.clk), imp: Math.round(u.imp), cpc: r2(cpcOf(u)), orders: r2(u.orders), sales: r2(u.sales), acos: r2(acosOf(u)) }, control: { spend: ctlSpend, clicks: ctlClicks, cpc: ctlCpc } } });
    }
    out.push({ id: iid === 'none' ? null : iid, at: t0.toISOString().slice(0, 16).replace('T', ' '), title: it?.title || '', who: it ? (it.approver && it.approver !== it.proposed_by ? `${it.proposed_by} (approved by ${it.approver})` : it.proposed_by) : list[0].by_user, hours, entries });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  const review = { at: nowPT().toISOString().slice(0, 16).replace('T', ' '), through: endKey, items: out, share: strip.share ?? null, rank: strip.rank ?? null };
  try { await putDataset('hypothesis_review', review, { rows: out.length }); } catch { /* still returned */ }
  return review;
}

export async function cachedReview(maxHours = 6) {
  const d = await dataset('hypothesis_review');
  if (d && Date.now() - new Date(d.produced_at) < maxHours * 3600000) return { ...d.payload, cached: true, produced_at: d.produced_at };
  return null;
}
