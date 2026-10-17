// The send, in three short steps driven by the popup after "Yes, send now":
//   stage   -> rows + checks + backup + rollback rows saved; item 'approved' (the confirm is the approval; warnings become the override note)
//   execute -> rows sent in API order, every row logged, item 'applied' or 'failed'
//   verify  -> Amazon read back and compared; hypotheses written with the baseline from the model
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk } from '../lib/auth.mjs';
import { db, audit, FAMILY, dataset } from '../lib/supabase.mjs';
import { family, liveState, assemble, prechecks, blocked, backupFor, execute, verify, newItemId, ptStamp, plainError, isDuplicate } from '../lib/engine.mjs';
import { restoreRows } from './restore.mjs';

export default async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const u = await currentUser(req);
  const f = await body(req);
  if (!u || !csrfOk(u, req, f)) return err('not signed in', 401);
  if (!['approver', 'owner'].includes(u.role)) return err('your role cannot send changes', 403);
  const step = f.step || 'stage';
  try {
    if (step === 'stage') return json(await stage(u, f));
    if (step === 'execute') return json(await run(u, f.id));
    if (step === 'verify') return json(await check(u, f.id));
    if (step === 'cancel') {  // staged but never executed (popup closed, network gone): leave an honest record
      await db().from('queue_items').update({ status: 'rejected', notes: [`${u.name} (${ptStamp()}): cancelled before execute`], updated_at: new Date().toISOString() }).eq('id', f.id).eq('status', 'approved');
      await audit(u, 'send_cancelled', f.id);
      return json({ ok: true });
    }
    return err('unknown step');
  } catch (ex) {
    await audit(u, 'send_refused', f.id || '', String(ex.message || ex));
    return json({ ok: false, error: String(ex.message || ex) });
  }
};

async function killed() {
  const d = await dataset('kill_switch', '_system');
  return !!d?.payload?.engaged;
}

async function stage(u, f) {
  if (await killed()) throw new Error('all sending is stopped (Stop all sending). An owner must release it first.');
  const fam = await family();
  const live = await liveState(fam);
  let rows, beforeBudgets, hyps = {}, undoes = null, title, lever, intent;
  if (f.since) {
    const r = await restoreRows(f.since, live);
    rows = r.rows; beforeBudgets = r.beforeBudgets; undoes = r.undoes;
    title = `Restore to before ${f.since}`; lever = 'revert'; intent = `Restore settings to how they were before ${f.since}.`;
  } else {
    const a = assemble(f, live, fam);
    rows = a.rows; beforeBudgets = a.beforeBudgets; hyps = a.hyps;
    const ncamp = a.touched.length;
    title = `Edits to ${ncamp} campaign${ncamp === 1 ? '' : 's'}: ${a.levers.join(', ')}`; lever = a.levers.join('+');
    intent = Object.entries(hyps).map(([k, v]) => `${k}: ${v.text}`).join(' | ');
  }
  const checks = await prechecks(rows, beforeBudgets, fam, { restore: !!f.since });
  const bl = blocked(checks);
  if (bl.length) throw new Error('blocked: ' + bl.map((c) => c.detail).join('; '));
  const id = newItemId(u.name, f.since ? '-REVERT' : '');
  const { before, rollback } = backupFor(rows, live);
  const warns = checks.filter((c) => c.level === 'warn').map((c) => c.detail).join('; ');
  const now = new Date().toISOString();
  const { error } = await db().from('queue_items').insert({ id, family: FAMILY(), kind: 'change', title, status: 'approved', lever, intent, hypothesis: Object.entries(hyps).map(([k, v]) => `${k}: ${v.text}`).join(' | '),
    proposed_by: u.name, approver: u.name, approved_at: now, override_note: warns ? 'Confirmed in the popup, warnings shown and accepted: ' + warns : '', rows, prechecks: checks,
    evidence: [`Staged online by ${u.name} at ${ptStamp()} PT from live settings read at ${live.at} PT.`], notes: [`${u.name} (${ptStamp()}): confirmed in the popup`], undoes });
  if (error) throw error;
  const { error: e2 } = await db().from('backups').insert({ item_id: id, before_state: before, rollback_rows: rollback });
  if (e2) throw e2;
  // hypotheses with the baseline from the model
  if (Object.keys(hyps).length) {
    const M = (await dataset('campaign_model'))?.payload;
    const byName = Object.fromEntries((M?.campaigns || []).map((c) => [c.name, c]));
    const hrows = Object.entries(hyps).map(([name, h]) => {
      const c = byName[name] || {};
      const base = { budget: parseFloat(live.state.campaigns.find((x) => x.name === name)?.budget?.budget || 0), spend_day_7d: c.k0 ? c.k0.cost / (c.act7 || 7) : null, orders_day_7d: c.k0 ? c.k0.orders / (c.act7 || 7) : null,
        acos_7d: c.k0?.acos ?? null, cpc_7d: c.k0?.cpc ?? null, cvr_7d: c.k0?.cvr ?? null, spend_day_30d: c.k30 ? c.k30.cost / (c.act30 || 30) : null, orders_day_30d: c.k30 ? c.k30.orders / (c.act30 || 30) : null, acos_30d: c.k30?.acos ?? null };
      const review = new Date(Date.now() + h.days * 86400000).toISOString().slice(0, 10);
      return { item_id: id, family: FAMILY(), campaign: name, by_user: u.name, hypothesis: h.text, success: h.success, review_days: h.days, review_on: review, baseline: base, changes: rows.filter((r) => r.campaign === name).map((r) => r.change) };
    });
    await db().from('hypotheses').upsert(hrows, { onConflict: 'item_id,campaign' });
  }
  await audit(u, 'apply_confirmed', id, title);
  return { ok: true, id, title, n: rows.length };
}

async function run(u, id) {
  const { data: it } = await db().from('queue_items').select('*').eq('id', id).single();
  if (!it || it.status !== 'approved') throw new Error(`item ${id} is ${it?.status || 'missing'}: cannot send`);
  if (await killed()) throw new Error('all sending is stopped');
  const { results, created } = await execute(it.rows);
  // "already exists" is not a failure: Amazon already holds what was asked. Logged as ALREADY so History counts it apart.
  for (const r of results) if (r.status === 'ERROR' && isDuplicate(r.error)) r.status = 'ALREADY';
  const okN = results.filter((r) => r.status === 'OK').length;
  const already = results.filter((r) => r.status === 'ALREADY').length;
  await db().from('applied_log').insert(results.map((r) => ({ ...r, item_id: id })));
  if (created.length) {
    const { data: b } = await db().from('backups').select('rollback_rows').eq('item_id', id).single();
    await db().from('backups').update({ rollback_rows: [...(b?.rollback_rows || []), ...created] }).eq('item_id', id);
  }
  const failed = results.length - okN - already;
  const summary = `${okN} OK` + (already ? `, ${already} already there` : '') + (failed ? `, ${failed} errors` : '');
  await db().from('queue_items').update({ status: failed ? 'failed' : 'applied', applied_at: new Date().toISOString(), result: summary, updated_at: new Date().toISOString() }).eq('id', id);
  await audit(u, failed ? 'send_failed' : 'sent', id, summary);
  return { ok: !failed, id, sent: okN, already, failed, summary,
    skipped: results.filter((r) => r.status === 'ALREADY').map((r) => `${r.campaign}: ${r.change} — ${plainError(r.error)}`),
    errors: results.filter((r) => r.status === 'ERROR').map((r) => `${r.campaign}: ${r.change} — ${plainError(r.error)}`) };
}

async function check(u, id) {
  const { data: it } = await db().from('queue_items').select('*').eq('id', id).single();
  if (!it) throw new Error('item missing');
  const fam = await family();
  const after = await liveState(fam);
  const diffs = verify(it.rows, after);
  const note = diffs.length ? `read-back differences: ${diffs.join('; ')}` : 'read-back: Amazon holds what was asked';
  await db().from('queue_items').update({ result: `${it.result}. ${note}`, notes: [...(it.notes || []), note], updated_at: new Date().toISOString() }).eq('id', id);
  if (it.undoes?.length) await db().from('hypotheses').update({ reverted_at: new Date().toISOString() }).in('item_id', it.undoes).is('reverted_at', null);
  await audit(u, diffs.length ? 'verify_diff' : 'verified', id, note);
  return { ok: !diffs.length, id, diffs, title: it.title, result: it.result };
}
