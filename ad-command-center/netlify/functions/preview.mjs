// What pressing "Review and send" would do: rows, hypotheses, charter checks, budget totals. Saves nothing, sends nothing.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk } from '../lib/auth.mjs';
import { family, liveState, assemble, prechecks } from '../lib/engine.mjs';
import { restoreRows } from './restore.mjs';

export default async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const u = await currentUser(req);
  const f = await body(req);
  if (!u || !csrfOk(u, req, f)) return err('not signed in', 401);
  if (!['approver', 'owner'].includes(u.role)) return json({ error: 'your role cannot send changes' });
  try {
    const fam = await family();
    const live = await liveState(fam);
    let rows, beforeBudgets, hyps = {};
    if (f.since) {
      ({ rows, beforeBudgets } = await restoreRows(f.since, live));
    } else {
      ({ rows, beforeBudgets, hyps } = assemble(f, live, fam));
    }
    const checks = await prechecks(rows, beforeBudgets, fam);
    const enabled = live.state.campaigns.filter((c) => c.state === 'ENABLED');
    const tb0 = enabled.reduce((s, c) => s + parseFloat(c.budget.budget), 0);
    const tb1 = enabled.reduce((s, c) => { const v = (f['b_' + c.campaignId] ?? '').toString().trim(); return s + (v !== '' ? parseFloat(v) : parseFloat(c.budget.budget)); }, 0);
    return json({ changes: rows.map((r) => `${r.campaign}: ${r.change}`), hyps: Object.fromEntries(Object.entries(hyps).map(([k, v]) => [k, v.text])), checks, budget: [tb0, tb1] });
  } catch (ex) {
    return json({ error: String(ex.message || ex) });
  }
};
