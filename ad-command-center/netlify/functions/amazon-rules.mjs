// The budget rules Amazon itself holds on a family's campaigns (Ads API /sp/campaigns/{id}/budgetRules), read live. Shown on
// the pages of a family the robot has not been set up for, so people see what runs on Amazon today. Read-only.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, FAMILY } from '../lib/supabase.mjs';
import { ads } from '../lib/ads.mjs';

const when = (yyyymmdd) => (yyyymmdd ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : null);

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  const fam = FAMILY();
  const { data, error } = await db().from('families').select('managed').eq('family', fam).maybeSingle();
  if (error) return err(error.message, 500);
  const camps = Object.entries(data?.managed?.campaigns || {});
  const rows = [];
  for (const [cid, c] of camps) {
    let rules = [];
    try { rules = (await ads('GET', `/sp/campaigns/${cid}/budgetRules`)).associatedRules || []; } catch (e) { rows.push({ cid, campaign: c.name, error: e.message.slice(0, 200) }); continue; }
    if (!rules.length) rows.push({ cid, campaign: c.name, budget: c.budget, rule: null });
    for (const r of rules) {
      const d = r.ruleDetails || {};
      const cond = d.performanceMeasureCondition;
      const inc = d.budgetIncreaseBy;
      rows.push({
        cid, campaign: c.name, budget: c.budget, rule: (d.name || '').trim(), type: d.ruleType, state: r.ruleState,
        condition: cond ? `${cond.metricName} ${cond.comparisonOperator === 'GREATER_THAN_OR_EQUAL_TO' ? '≥' : cond.comparisonOperator === 'LESS_THAN_OR_EQUAL_TO' ? '≤' : cond.comparisonOperator} ${cond.threshold}` : (d.ruleType === 'SCHEDULE' ? 'on schedule' : ''),
        increase: inc ? (inc.type === 'PERCENT' ? `+${inc.value}%` : `+$${inc.value}`) : '',
        since: when(d.duration?.dateRangeTypeRuleDuration?.startDate), until: when(d.duration?.dateRangeTypeRuleDuration?.endDate),
        recurrence: d.recurrence?.type || '', updated: r.lastUpdatedDate ? new Date(r.lastUpdatedDate).toISOString().slice(0, 10) : null,
      });
    }
  }
  return json({ ok: true, family: fam, status: data?.managed?.status || null, rows });
};
