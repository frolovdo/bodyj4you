// Restore to before a point in time: merge the undo rows of every applied item since then (oldest value wins per field).
// Used by preview.mjs and send.mjs with { since }. GET /api/restore?since=... returns the preview without sending.
import { json, err } from '../lib/http.mjs';
import { currentUser } from '../lib/auth.mjs';
import { db, FAMILY } from '../lib/supabase.mjs';

export async function restoreRows(since, live) {
  const sinceIso = new Date(since.replace(' ', 'T') + (since.length <= 16 ? ':00' : '') + '-07:00').toISOString();
  const { data: items } = await db().from('queue_items').select('id, applied_at, title').eq('family', FAMILY()).eq('status', 'applied').gte('applied_at', sinceIso).order('applied_at');
  if (!items?.length) throw new Error(`nothing sent since ${since} can be undone`);
  const { data: backs } = await db().from('backups').select('item_id, rollback_rows').in('item_id', items.map((i) => i.id));
  const byItem = Object.fromEntries((backs || []).map((b) => [b.item_id, b.rollback_rows]));
  const merged = {}, order = [];
  for (const it of items) {
    for (const r of byItem[it.id] || []) {
      const idk = Object.keys(r.body).find((k) => k.endsWith('Id'));
      const key = r.api + '|' + r.body[idk];
      if (!merged[key]) { merged[key] = { ...r, body: { [idk]: r.body[idk] }, changes: [] }; order.push(key); }
      for (const [f, v] of Object.entries(r.body)) if (f !== idk && !(f in merged[key].body)) merged[key].body[f] = v;
      merged[key].changes.push(r.change);
    }
  }
  const back = (x) => { const m = /^undo:\s*(.*?)\s*(\S+)\s*->\s*(\S+)$/.exec(x); return m ? `${m[1].trim() || 'value'} back to ${m[2]}` : x.replace('undo: ', 'put back: '); };
  const rows = order.map((k) => { const r = merged[k]; return { api: r.api, entity: r.entity, campaign: r.campaign, target: r.target, body: r.body, setting: 'restore', before: 'current', after: 'as before ' + since,
    change: 'restore: ' + r.changes.map(back).join('; ').slice(0, 200), why: 'restore to before ' + since }; });
  const beforeBudgets = Object.fromEntries(live.state.campaigns.map((c) => [c.name, c.budget?.budget]));
  return { rows, beforeBudgets, undoes: items.map((i) => i.id) };
}

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return err('not signed in', 401);
  return json({ ok: true, note: 'POST /api/preview or /api/send with { since } to restore' });
};
