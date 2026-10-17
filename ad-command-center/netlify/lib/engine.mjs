// The change engine, ported from the Mac tool (ac_brief._assemble, opsq.prechecks, apply.py): turn a form into API rows,
// check them against the charter, take a backup, send, build the undo rows, read back. Nothing here sends by itself:
// send.mjs calls these steps one at a time so each stays inside a function's time limit.
import { db, dataset, FAMILY } from './supabase.mjs';
import { spState, sbCampaigns, send as adsSend } from './ads.mjs';

export const ORDER = ['PUT /sp/campaigns', 'PUT /sp/keywords', 'PUT /sp/targets', 'POST /sp/keywords', 'POST /sp/negativeKeywords'];
const PT_OFFSET_H = -7;

export const nowPT = () => new Date(Date.now() + PT_OFFSET_H * 3600 * 1000);
export const ptDate = () => nowPT().toISOString().slice(0, 10);
export const ptStamp = () => nowPT().toISOString().slice(0, 16).replace('T', ' ');

export async function family() {
  const { data, error } = await db().from('families').select('*').eq('family', FAMILY()).single();
  if (error) throw error;
  return data;
}

export async function model() {
  const d = await dataset('campaign_model');
  if (!d) throw new Error('campaign_model has not been pushed yet (run ac_push_supabase.py model on the engine)');
  return d.payload;
}

export async function liveState(fam) {
  const ids = Object.keys(fam.managed.campaigns);
  const sp = ids.filter((c) => (fam.managed.campaigns[c].type || 'SP') === 'SP');
  const sb = ids.filter((c) => fam.managed.campaigns[c].type === 'SB');
  const [state, banners] = await Promise.all([spState(sp), sb.length ? sbCampaigns(sb) : Promise.resolve([])]);
  return { state, banners, at: ptStamp() };
}

const num = (v, lo, hi, what) => {
  const x = parseFloat(String(v).replace(/[$,%\s]/g, ''));
  if (!isFinite(x)) throw new Error(`${what}: not a number`);
  if (x < lo || x > hi) throw new Error(`${what}: ${x} is outside ${lo}..${hi}`);
  return x;
};

/** Form -> rows. form keys: b_<cid>, t_<cid>, p_<cid>, r_<cid>, kw_<keywordId>, tg_<targetId>, hyp_<cid>, succ_<cid>, days_<cid> */
export function assemble(form, live, fam) {
  const rows = [], levers = new Set(), beforeBudgets = {};
  const S = live.state;
  for (const c of S.campaigns) {
    const cid = c.campaignId;
    beforeBudgets[c.name] = c.budget?.budget;
    const cur = Object.fromEntries((c.dynamicBidding?.placementBidding || []).map((p) => [p.placement, p.percentage]));
    const b = (form['b_' + cid] ?? '').toString().trim();
    if (b !== '') {
      const nb = num(b, 1, 1000, c.name + ' budget');
      if (Math.abs(nb - parseFloat(c.budget.budget)) > 1e-9) {
        rows.push({ api: 'PUT /sp/campaigns', entity: 'campaign', campaign: c.name, target: null, body: { campaignId: cid, budget: { budget: nb, budgetType: 'DAILY' } },
          setting: 'daily budget', before: '$' + c.budget.budget, after: '$' + nb, change: `budget $${c.budget.budget} -> $${nb}` });
        levers.add('budget');
      }
    }
    const want = {};
    for (const [fld, key] of [['t_', 'PLACEMENT_TOP'], ['p_', 'PLACEMENT_PRODUCT_PAGE'], ['r_', 'PLACEMENT_REST_OF_SEARCH']]) {
      const v = (form[fld + cid] ?? '').toString().trim();
      if (v === '') continue;
      const pct = Math.round(num(v, 0, 900, c.name + ' ' + key));
      if (pct !== (cur[key] || 0)) want[key] = pct;
    }
    if (Object.keys(want).length) {
      // keep everything else in dynamicBidding exactly as it is (strategy, shopperCohortBidding): a bidding PUT replaces the whole object
      const pb = { ...cur, ...want };
      const placementBidding = Object.entries(pb).filter(([, v]) => v > 0).map(([placement, percentage]) => ({ placement, percentage }));
      const dyn = { ...(c.dynamicBidding || {}), placementBidding };
      rows.push({ api: 'PUT /sp/campaigns', entity: 'campaign', campaign: c.name, target: null, body: { campaignId: cid, dynamicBidding: dyn }, setting: 'placement',
        before: Object.entries(cur).map(([k, v]) => `${k} ${v}%`).join(', ') || 'none', after: Object.entries(pb).map(([k, v]) => `${k} ${v}%`).join(', '),
        change: Object.entries(want).map(([k, v]) => `${k} ${cur[k] || 0}% -> ${v}%`).join('; ') });
      levers.add('placement');
    }
  }
  const cname = Object.fromEntries(S.campaigns.map((c) => [c.campaignId, c.name]));
  for (const k of S.keywords) {
    const v = (form['kw_' + k.keywordId] ?? '').toString().trim();
    if (k.state !== 'ENABLED' || v === '') continue;
    const nb = Math.round(num(v, 0.02, 10, 'bid for ' + k.keywordText) * 100) / 100;
    if (Math.abs(nb - parseFloat(k.bid || 0)) > 1e-9) {
      rows.push({ api: 'PUT /sp/keywords', entity: 'keyword', campaign: cname[k.campaignId], target: `${k.keywordText} [${k.matchType}]`, body: { keywordId: k.keywordId, bid: nb },
        setting: `bid ${k.keywordText} [${k.matchType}]`, before: '$' + k.bid, after: '$' + nb, change: `bid $${k.bid} -> $${nb}` });
      levers.add('bid');
    }
  }
  for (const t of S.targets || []) {
    const v = (form['tg_' + t.targetId] ?? '').toString().trim();
    if (t.state !== 'ENABLED' || v === '') continue;
    const nb = Math.round(num(v, 0.02, 10, 'target bid') * 100) / 100;
    if (Math.abs(nb - parseFloat(t.bid || 0)) > 1e-9) {
      const ex = (t.expression || []).map((e) => `${e.type || ''} ${e.value || ''}`).join(', ');
      rows.push({ api: 'PUT /sp/targets', entity: 'target', campaign: cname[t.campaignId], target: ex, body: { targetId: t.targetId, bid: nb }, setting: 'bid target ' + ex,
        before: '$' + t.bid, after: '$' + nb, change: `bid $${t.bid} -> $${nb}` });
      levers.add('bid');
    }
  }
  // new keywords and negatives (Keywords page): kadd_<i>=json, kneg_<i>=json rows prepared by the client from the model.
  // Checked against what Amazon holds right now, so a second press of the same list adds nothing twice:
  //   already an enabled exact keyword there -> skipped and said so; paused there -> turned back on at the new bid (Amazon refuses a duplicate);
  //   already blocked there -> skipped.
  const skipped = [];
  const norm = (s) => String(s || '').trim().toLowerCase();
  for (const [k, v] of Object.entries(form)) {
    if (!/^(kadd|kneg)_/.test(k) || !v) continue;
    let r; try { r = JSON.parse(v); } catch { continue; }
    const camp = cname[r.campaignId] || r.campaignName;
    if (k.startsWith('kadd_') && r.campaignId && r.adGroupId && r.keywordText) {
      const bid = Math.round(num(r.bid, 0.2, 3, 'bid for ' + r.keywordText) * 100) / 100;
      const have = S.keywords.find((x) => String(x.campaignId) === String(r.campaignId) && x.matchType === 'EXACT' && norm(x.keywordText) === norm(r.keywordText) && x.state !== 'ARCHIVED');
      if (have && have.state === 'ENABLED') { skipped.push(`'${r.keywordText}' is already an exact keyword in ${camp} at $${have.bid}, so nothing to add`); continue; }
      if (have) {  // paused: Amazon refuses a second copy, so switch the existing one back on at the asked bid
        rows.push({ api: 'PUT /sp/keywords', entity: 'keyword', campaign: camp, target: `${r.keywordText} [EXACT]`, body: { keywordId: have.keywordId, state: 'ENABLED', bid },
          setting: 'keyword back on', before: `paused at $${have.bid}`, after: `on at $${bid}`, change: `turn exact '${r.keywordText}' back on at $${bid} (was paused at $${have.bid})` });
        levers.add('new keywords');
        continue;
      }
      rows.push({ api: 'POST /sp/keywords', entity: 'keyword', campaign: camp, target: `${r.keywordText} [EXACT]`,
        body: { campaignId: r.campaignId, adGroupId: r.adGroupId, keywordText: r.keywordText, matchType: 'EXACT', bid, state: 'ENABLED' }, setting: 'new keyword', before: '-', after: `exact at $${bid}`,
        change: `add exact '${r.keywordText}' at $${bid}` });
      levers.add('new keywords');
    } else if (k.startsWith('kneg_') && r.campaignId && r.adGroupId && r.keywordText) {
      const have = (S.negativeKeywords || []).find((x) => String(x.campaignId) === String(r.campaignId) && String(x.adGroupId) === String(r.adGroupId) && x.matchType === 'NEGATIVE_EXACT' && norm(x.keywordText) === norm(r.keywordText) && x.state === 'ENABLED');
      if (have) { skipped.push(`'${r.keywordText}' is already blocked in ${camp}, so nothing to add`); continue; }
      rows.push({ api: 'POST /sp/negativeKeywords', entity: 'negative keyword', campaign: camp, target: r.keywordText,
        body: { campaignId: r.campaignId, adGroupId: r.adGroupId, keywordText: r.keywordText, matchType: 'NEGATIVE_EXACT', state: 'ENABLED' }, setting: 'negative keyword', before: '-', after: 'negative exact',
        change: `block exact '${r.keywordText}'` });
      levers.add('negative keywords');
    }
  }
  // hypotheses: one per touched campaign, at least 10 characters
  const touched = [...new Set(rows.map((r) => r.campaign).filter(Boolean))];
  const cidOf = Object.fromEntries(S.campaigns.map((c) => [c.name, c.campaignId]));
  const hyps = {};
  for (const name of touched) {
    const cid = cidOf[name] || '';
    const h = (form['hyp_' + cid] ?? '').toString().trim();
    if (h.length < 10) throw new Error(`write a hypothesis for ${name}: what you expect and which number will show it`);
    hyps[name] = { text: h, success: form['succ_' + cid] || 'orders_up', days: parseInt(form['days_' + cid] || '14', 10) || 14 };
  }
  for (const r of rows) r.why = (hyps[r.campaign]?.text || '').slice(0, 120);
  if (!rows.length) throw new Error(skipped.length ? 'nothing to send: ' + skipped.join('; ') : 'nothing changed: every value equals what is live now');
  return { rows, levers: [...levers].sort(), beforeBudgets, hyps, touched, skipped };
}

/** Amazon's error JSON in plain words, for the popup and the History page. */
export function plainError(raw) {
  const s = String(raw || '');
  if (!s) return '';
  if (/duplicateValueError|already exists/i.test(s)) return 'already on Amazon, so nothing to do';
  if (/entityNotFound/i.test(s)) return 'not found on Amazon any more';
  if (/throttl|429/i.test(s)) return 'Amazon was busy (rate limit); try again in a minute';
  const m = s.match(/"message"\s*:\s*"([^"]{3,160})/);
  return m ? m[1] : s.slice(0, 160);
}
export const isDuplicate = (raw) => /duplicateValueError|already exists/i.test(String(raw || ''));

/** Charter checks, same names and levels as the Mac tool. */
export async function prechecks(rows, beforeBudgets, fam, { emergency = false, exceptItem = null, restore = false } = {}) {
  const ch = fam.charter, out = [], add = (name, level, detail) => out.push({ name, level, detail });
  const today = ptDate();
  const lock = (ch.lock_windows || []).find((w) => w.start <= today && today <= w.end);
  add('lock_window', lock ? (emergency ? 'ok' : 'block') : 'ok', lock ? `inside lock window ${lock.start}..${lock.end}: ${lock.reason}` : 'not inside a lock window');
  const cd = ch.change_rules?.changes_day || 'Monday';
  const dayName = nowPT().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  add('changes_day', dayName === cd || emergency ? 'ok' : 'warn', `${today} is ${dayName} (changes day is ${cd})`);
  // one lever per week: look at applied/approved items this week with a different lever
  const monday = new Date(nowPT()); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); const wk = monday.toISOString().slice(0, 10);
  const levers = new Set(rows.map((r) => r.api.includes('campaigns') ? (r.setting === 'placement' ? 'placement' : 'budget') : r.api.startsWith('POST') ? 'new keywords' : 'bid'));
  const { data: others } = await db().from('queue_items').select('id, lever, applied_at, approved_at').eq('family', FAMILY()).in('status', ['approved', 'applied']).gte('created_at', wk + 'T00:00:00Z');
  const other = (others || []).filter((i) => i.id !== exceptItem && i.lever && i.lever !== 'none' && i.lever !== 'revert' && ![...levers].includes(i.lever) && !i.lever.split('+').every((l) => levers.has(l)));
  add('one_lever', other.length ? 'warn' : 'ok', other.length ? `another lever this week: ${other.map((i) => `${i.id} (${i.lever})`).join(', ')}` : 'no other lever changed this week');
  const lim = ch.change_rules?.step_limit_pct_per_week || 25;
  const floors = Object.values(ch.floors || {});
  let floorHit = false;
  for (const r of rows) {
    const b = r.body || {}, name = r.campaign || '';
    if (r.api === 'PUT /sp/campaigns' && b.budget) {
      const nb = b.budget.budget, ob = beforeBudgets[name];
      if (ob && !restore) { const pct = (100 * (nb - ob)) / ob; if (Math.abs(pct) > lim) add('step_limit', 'warn', `${name} budget $${ob} -> $${nb} is ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% (limit ${lim}%/week). ${pct < 0 ? 'A cut this deep needs the extra tick below.' : 'Confirming records the override.'}`); }
      for (const f of floors) if (name.includes(f.campaign_name_contains) && nb < f.min_budget) { add('floor', 'block', `${name} budget $${nb} is below the floor $${f.min_budget}`); floorHit = true; }
    }
    if (r.api === 'PUT /sp/campaigns' && b.dynamicBidding) {
      const tos = (b.dynamicBidding.placementBidding || []).find((p) => p.placement === 'PLACEMENT_TOP')?.percentage || 0;
      for (const f of floors) if (name.includes(f.campaign_name_contains) && f.min_tos_pct && tos < f.min_tos_pct) { add('floor', 'block', `${name} top-of-search ${tos}% is below the floor ${f.min_tos_pct}%`); floorHit = true; }
    }
    if (r.api === 'PUT /sp/keywords' && 'bid' in b) {
      for (const f of floors) if (name.includes(f.campaign_name_contains) && /rosehip oil \[EXACT\]/i.test(r.target || '') && b.bid < (f.min_bid_exact_head || 0)) { add('floor', 'block', `${name} bid $${b.bid} is below the head-term floor $${f.min_bid_exact_head}`); floorHit = true; }
    }
  }
  if (!floorHit) add('floor', 'ok', 'no floor touched');
  // family product-ad budget ceiling
  const target = ch.budget?.product_ads_target_per_day;
  if (target) {
    const after = { ...beforeBudgets };
    for (const r of rows) if (r.api === 'PUT /sp/campaigns' && r.body?.budget) after[r.campaign] = r.body.budget.budget;
    const total = Object.entries(after).filter(([n]) => !/BANNER/i.test(n)).reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
    add('budget_ceiling', total > target * 1.02 ? 'warn' : 'ok', `product-ad budget after: $${total.toFixed(0)} of $${target}`);
  }
  return out;
}

export const blocked = (checks) => checks.filter((c) => c.level === 'block');

/** Backup: the live objects the rows touch, plus the undo rows (old values of the same fields). */
export function backupFor(rows, live) {
  const S = live.state;
  const idx = {};
  for (const c of S.campaigns) idx['campaigns:' + c.campaignId] = c;
  for (const k of S.keywords) idx['keywords:' + k.keywordId] = k;
  for (const t of S.targets || []) idx['targets:' + t.targetId] = t;
  const before = {}, rollback = [];
  for (const r of rows) {
    const b = r.body || {};
    const [kind, idk] = r.api.includes('/campaigns') ? ['campaigns', 'campaignId'] : r.api.includes('/targets') ? ['targets', 'targetId'] : ['keywords', 'keywordId'];
    if (r.api.startsWith('PUT')) {
      const old = idx[kind + ':' + b[idk]];
      if (!old) continue;
      before[kind + ':' + b[idk]] = old;
      const undo = { [idk]: b[idk] };
      for (const f of Object.keys(b)) if (f !== idk && f in old) undo[f] = old[f];
      rollback.push({ api: r.api, entity: r.entity, campaign: r.campaign, target: r.target, body: undo, change: 'undo: ' + r.change });
    }
  }
  return { before, rollback };
}

/** Send all rows in API order, batches of 100. Returns per-row results and the pause rows for anything created. */
export async function execute(rows) {
  const results = [], created = [];
  const groups = {};
  for (const r of rows) (groups[r.api] ||= []).push(r);
  for (const api of ORDER) {
    const items = groups[api];
    if (!items) continue;
    const idk = api.includes('/campaigns') ? 'campaignId' : api.includes('/targets') ? 'targetId' : 'keywordId';
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      let ok = {}, err = {};
      try {
        const resp = await adsSend(api, chunk.map((r) => r.body));
        const wrap = api.includes('negativeKeywords') ? 'negativeKeywords' : api.includes('/targets') ? 'targetingClauses' : api.includes('/keywords') ? 'keywords' : 'campaigns';
        const res = resp[wrap] || resp;
        for (const s of res.success || []) ok[s.index] = s;
        for (const e of res.error || []) err[e.index] = e;
      } catch (ex) { chunk.forEach((_, j) => (err[j] = { errors: [String(ex).slice(0, 300)] })); }
      chunk.forEach((r, j) => {
        const status = j in ok ? 'OK' : 'ERROR';
        const newId = ok[j]?.[idk] || ok[j]?.negativeKeywordId || ok[j]?.keywordId || r.body[idk];
        results.push({ api, campaign: r.campaign, target: r.target || '', change: r.change, why: r.why || '', status, entity_id: String(newId || ''), error: status === 'OK' ? '' : JSON.stringify(err[j] || {}).slice(0, 300) });
        if (status === 'OK' && api.startsWith('POST')) created.push({ api: api.replace('POST', 'PUT'), entity: r.entity, campaign: r.campaign, target: r.target, body: { [idk]: newId, state: 'PAUSED' }, change: 'undo: pause what was created' });
      });
    }
  }
  return { results, created };
}

/** Read back: does Amazon now hold what we asked for? Returns a list of differences. */
export function verify(rows, after) {
  const idx = {};
  for (const c of after.state.campaigns) idx['campaigns:' + c.campaignId] = c;
  for (const k of after.state.keywords) idx['keywords:' + k.keywordId] = k;
  for (const t of after.state.targets || []) idx['targets:' + t.targetId] = t;
  const diffs = [];
  for (const r of rows) {
    if (!r.api.startsWith('PUT')) continue;
    const b = r.body, [kind, idk] = r.api.includes('/campaigns') ? ['campaigns', 'campaignId'] : r.api.includes('/targets') ? ['targets', 'targetId'] : ['keywords', 'keywordId'];
    const now = idx[kind + ':' + b[idk]];
    if (!now) { diffs.push(`${r.campaign}: ${kind} ${b[idk]} not found on read-back`); continue; }
    if (b.budget && Math.abs(parseFloat(now.budget?.budget) - b.budget.budget) > 0.005) diffs.push(`${r.campaign}: budget is $${now.budget?.budget}, asked $${b.budget.budget}`);
    if ('bid' in b && Math.abs(parseFloat(now.bid) - b.bid) > 0.005) diffs.push(`${r.campaign} ${r.target}: bid is $${now.bid}, asked $${b.bid}`);
    if ('state' in b && now.state !== b.state) diffs.push(`${r.campaign} ${r.target || ''}: state is ${now.state}, asked ${b.state}`);
    if (b.dynamicBidding) {
      const want = Object.fromEntries((b.dynamicBidding.placementBidding || []).map((p) => [p.placement, p.percentage]));
      const got = Object.fromEntries((now.dynamicBidding?.placementBidding || []).map((p) => [p.placement, p.percentage]));
      for (const [k, v] of Object.entries(want)) if ((got[k] || 0) !== v) diffs.push(`${r.campaign}: ${k} is ${got[k] || 0}%, asked ${v}%`);
    }
  }
  return diffs;
}

export function newItemId(userName, suffix = '') {
  const d = nowPT().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6}).*/, '$1-$2');
  return `UI-${d}-${userName.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase()}${suffix}`;
}
