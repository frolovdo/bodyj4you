// Rules page: the rulebook (dataset ACCOUNT/rulebook, built daily on the Mac by adsops/ac_rulebook.py), the grades chosen
// here (dataset ACCOUNT/rulebook_choices; the Mac pulls them hourly into the judge's rules.json), and today's status of the
// campaigns the hourly judge runs for (datasets <family>/rules_now).
// Choices: {all: grade, portfolios: {id: grade}, campaigns: {id: grade}, rules: {cid: {"roas.cut": grade}}}; grade = conservative |
// moderate | radical | off. A rule's own choice beats the campaign's, which beats the portfolio's, which beats "all".
// GET: on a family page only the portfolios holding that family's campaigns. POST (approver+): {csrf, all?, portfolios?, campaigns?, rules?}.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { db, FAMILY, audit, dataset } from '../lib/supabase.mjs';

const GRADES = ['conservative', 'moderate', 'radical', 'off'];
const EMPTY = { all: null, portfolios: {}, campaigns: {}, rules: {} };
const ID = /^-?\d{1,20}$/;
const KEY = /^[a-z]+\.(cut|reward)$/;

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  if (req.method === 'GET') {
    const fam = FAMILY();
    const [rb, ch, rn] = await Promise.all([
      dataset('rulebook', 'ACCOUNT'), dataset('rulebook_choices', 'ACCOUNT'),
      db().from('datasets').select('family, payload').eq('name', 'rules_now'),
    ]);
    if (!rb?.payload) return json({ ok: true, rulebook: null, choices: EMPTY, today: {} });
    const book = rb.payload;
    let portfolios = book.portfolios || [];
    if (fam !== 'ACCOUNT') portfolios = portfolios.filter((p) => p.campaigns.some((c) => c.family === fam));
    const today = {};
    for (const r of rn.data || []) {
      for (const c of r.payload?.campaigns || []) {
        const rules = {};
        for (const x of c.rules || []) rules[x.key] = { fired: x.record?.fired || 0, held: x.record?.held || 0, today_hour: x.today_hour ?? null };
        today[c.cid] = { status: c.today?.status || '', calls: c.calls, level: c.level || null, hour: r.payload.hour, family: r.family, as_of: r.payload.as_of, rules };
      }
    }
    return json({ ok: true, rulebook: { ...book, portfolios }, choices: { ...EMPTY, ...(ch?.payload || {}) }, today, produced_at: rb.produced_at });
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'approver')) return err('only approvers and owners can apply rules', 403);
  const cur = { ...EMPTY, ...((await dataset('rulebook_choices', 'ACCOUNT'))?.payload || {}) };
  for (const k of ['portfolios', 'campaigns', 'rules']) cur[k] = cur[k] || {};
  const changes = [];
  const grade = (g) => (g == null || g === '' ? null : GRADES.includes(g) ? g : undefined);
  if ('all' in f) {
    const g = grade(f.all);
    if (g === undefined) return err('bad grade');
    cur.all = g; changes.push(`all campaigns: ${g || 'follow'}`);
  }
  for (const kind of ['portfolios', 'campaigns']) {
    for (const [id, v] of Object.entries(f[kind] || {})) {
      if (!ID.test(id)) return err('bad id');
      const g = grade(v);
      if (g === undefined) return err('bad grade');
      if (g) cur[kind][id] = g; else delete cur[kind][id];
      changes.push(`${kind.slice(0, -1)} ${id}: ${g || 'follow'}`);
    }
  }
  for (const [cid, set] of Object.entries(f.rules || {})) {
    if (!ID.test(cid)) return err('bad id');
    cur.rules[cid] = cur.rules[cid] || {};
    for (const [key, v] of Object.entries(set || {})) {
      if (!KEY.test(key)) return err('bad rule');
      const g = grade(v);
      if (g === undefined) return err('bad grade');
      if (g) cur.rules[cid][key] = g; else delete cur.rules[cid][key];
      changes.push(`campaign ${cid} ${key}: ${g || 'follow'}`);
    }
    if (!Object.keys(cur.rules[cid]).length) delete cur.rules[cid];
  }
  if (!changes.length) return err('nothing to change');
  cur.updated_at = new Date().toISOString(); cur.by = u.name;
  const rows = (cur.all ? 1 : 0) + Object.keys(cur.portfolios).length + Object.keys(cur.campaigns).length + Object.values(cur.rules).reduce((n, s) => n + Object.keys(s).length, 0);
  const { error } = await db().from('datasets').upsert({ family: 'ACCOUNT', name: 'rulebook_choices', payload: cur, produced_at: cur.updated_at, produced_by: 'site', rows }, { onConflict: 'family,name' });
  if (error) return err(error.message, 500);
  await audit(u, 'rulebook_grade', changes.length === 1 ? changes[0] : `${changes.length} changes`, changes.join('; '));
  return json({ ok: true, choices: cur });
};
