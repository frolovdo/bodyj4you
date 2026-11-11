// Rules page: the rulebook (dataset ACCOUNT/rulebook, built daily on the Mac by adsops/ac_rulebook.py), the layer
// choices made here (dataset ACCOUNT/rulebook_choices; the Mac pulls them hourly into the judge's rules.json), and the
// hourly status of the campaigns the judge already runs for (datasets <family>/rules_now).
// GET: on a family page only the portfolios holding that family's campaigns. POST (approver+): {csrf, portfolios:{id:layer|null}, campaigns:{id:layer|null}}.
import { json, err, body } from '../lib/http.mjs';
import { currentUser, csrfOk, can } from '../lib/auth.mjs';
import { db, FAMILY, audit, dataset } from '../lib/supabase.mjs';

const LAYERS = ['optimistic', 'realistic', 'conservative'];
const EMPTY = { portfolios: {}, campaigns: {} };

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
      for (const c of r.payload?.campaigns || []) today[c.cid] = { status: c.today?.status || '', calls: c.calls, layer: c.layer || null, hour: r.payload.hour, family: r.family, as_of: r.payload.as_of };
    }
    return json({ ok: true, rulebook: { ...book, portfolios }, choices: ch?.payload || EMPTY, today, produced_at: rb.produced_at });
  }
  const f = await body(req);
  if (!csrfOk(u, req, f)) return err('bad request', 403);
  if (!can(u, 'approver')) return err('only approvers and owners can apply a layer', 403);
  const cur = (await dataset('rulebook_choices', 'ACCOUNT'))?.payload || EMPTY;
  cur.portfolios = cur.portfolios || {}; cur.campaigns = cur.campaigns || {};
  const changes = [];
  for (const kind of ['portfolios', 'campaigns']) {
    for (const [id, layer] of Object.entries(f[kind] || {})) {
      if (!/^-?\d{1,20}$/.test(id)) return err('bad id');
      if (layer == null || layer === '') { delete cur[kind][id]; changes.push(`${kind.slice(0, -1)} ${id}: follow`); continue; }
      if (!LAYERS.includes(layer)) return err('bad layer');
      cur[kind][id] = layer; changes.push(`${kind.slice(0, -1)} ${id}: ${layer}`);
    }
  }
  cur.updated_at = new Date().toISOString(); cur.by = u.name;
  const { error } = await db().from('datasets').upsert({ family: 'ACCOUNT', name: 'rulebook_choices', payload: cur, produced_at: cur.updated_at, produced_by: 'site', rows: Object.keys(cur.campaigns).length + Object.keys(cur.portfolios).length }, { onConflict: 'family,name' });
  if (error) return err(error.message, 500);
  await audit(u, 'rulebook_layer', changes.length === 1 ? changes[0] : `${changes.length} changes`, changes.join('; '));
  return json({ ok: true, choices: cur });
};
