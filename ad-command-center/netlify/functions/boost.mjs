// Budget boost page: the hourly robot's latest check (dataset ACCOUNT/boost, written on the Mac by adsops/ac_boost.py every
// hour at :15) and the per-campaign settings people change here (dataset ACCOUNT/boost_settings: {cid: {level, by, at}}),
// which the robot reads before every run. POST (approver+): {csrf, cid, level?, budget?}. A level is saved for the robot;
// a budget goes to Amazon right away (PUT /sp/campaigns) and is read back; the robot takes it as the new base next hour.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { db, dataset, audit } from '../lib/supabase.mjs';
import { send, spList } from '../lib/ads.mjs';

const liveBudget = async (cid) => (await spList('/sp/campaigns/list', 'spCampaign', 'campaigns', { campaignIdFilter: { include: [cid] } }))[0]?.budget?.budget ?? null;

const ID = /^\d{1,20}$/;

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  if (req.method === 'GET') {
    const [d, s] = await Promise.all([dataset('boost', 'ACCOUNT'), dataset('boost_settings', 'ACCOUNT')]);
    if (!d?.payload) return json({ ok: true, boost: null, settings: {} });
    return json({ ok: true, boost: d.payload, settings: s?.payload || {}, can_edit: can(u, 'approver'), produced_at: d.produced_at, now: new Date().toISOString() });
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'approver')) return err('only approvers and owners can change budgets and levels', 403);
  const cid = String(f.cid || '');
  if (!ID.test(cid)) return err('bad campaign id');
  const name = String(f.name || cid).slice(0, 120);
  const out = { ok: true };
  if (f.level != null && f.level !== '') {
    const level = Number(f.level);
    if (!(level > 0 && level < 100)) return err('bad ROAS level');
    const cur = (await dataset('boost_settings', 'ACCOUNT'))?.payload || {};
    cur[cid] = { ...(cur[cid] || {}), name, level, by: u.name, at: new Date().toISOString() };
    const { error } = await db().from('datasets').upsert({ family: 'ACCOUNT', name: 'boost_settings', payload: cur, produced_at: cur[cid].at, produced_by: 'site', rows: Object.keys(cur).length }, { onConflict: 'family,name' });
    if (error) return err(error.message, 500);
    await audit(u, 'boost_level', name, `ROAS level ${level}`);
    out.level = level;
  }
  if (f.budget != null && f.budget !== '') {
    const budget = Math.round(Number(f.budget) * 100) / 100;
    if (!(budget >= 1 && budget <= 5000)) return err('budget must be between $1 and $5,000');
    const before = await liveBudget(cid);
    let r;
    try { r = await send('PUT /sp/campaigns', [{ campaignId: cid, budget: { budget, budgetType: 'DAILY' } }]); } catch (e) { return err('Amazon refused: ' + e.message.slice(0, 300), 502); }
    const res = r.campaigns || r;
    if (res.error?.length) return err('Amazon refused: ' + JSON.stringify(res.error[0]).slice(0, 300), 502);
    const after = await liveBudget(cid);
    await audit(u, 'boost_budget', name, `budget $${before} -> $${budget} (read back $${after})`);
    out.budget = after; out.budget_before = before;
    if (after !== budget) out.warning = `Amazon reads back $${after}, not $${budget}`;
  }
  if (out.level == null && out.budget == null) return err('nothing to change');
  return json(out);
};
