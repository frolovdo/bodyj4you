// Ops page (/ops) data endpoint: the page's named actions only (same list as ACT in the page), behind the Ops PIN session.
// Writes go to the same Supabase tables the claude.ai copy uses; "pull" and "ship" rows start the GitHub job via the
// existing ops_refresh trigger -> ops-dispatch.
import { json, err, body } from '../lib/http.mjs';
import { db } from '../lib/supabase.mjs';
import { opsSession } from '../lib/opsauth.mjs';

const int = (v) => { const n = parseInt(v, 10); if (!Number.isFinite(n) || n < 0) throw new Error('bad number'); return n; };
const str = (v, max) => (v == null ? null : String(v).slice(0, max));
const rows = (r) => { if (r.error) throw new Error(r.error.message); return r.data ?? []; };
const one = (r) => { const d = rows(r); return Array.isArray(d) ? d : [d]; };
const now = () => new Date().toISOString();

const ACT = {
  pull_start: () => db().from('ops_refresh').insert({ requested_by: 'ops page' }).select('id'),
  refresh_get: (a) => db().from('ops_refresh').select('status,message,snapshot_id,result').eq('id', int(a.id)),
  snapshot_get: (a) => db().from('ops_snapshot').select('id,produced_at,snapshot_date,data').eq('id', int(a.id)),
  snapshot_latest: () => db().from('ops_snapshot').select('id,produced_at,snapshot_date,data').order('id', { ascending: false }).limit(1),
  log_add: (a) => db().from('ops_log').insert({ action: str(a.action, 200), detail: str(a.detail, 2000), ref: str(a.ref, 200) }),
  order_create: (a) => {
    const kind = ['PO', 'STEEL', 'UV'].includes(a.kind) ? a.kind : null;
    if (!kind || !Array.isArray(a.lines) || !a.lines.length || a.lines.length > 500) throw new Error('bad order');
    const lines = a.lines.map((l) => ({ sku: str(l.sku, 80), cat: str(l.cat, 80), qty: int(l.qty), cost: Number(l.cost) || 0 }));
    return db().from('ops_orders').insert({ kind, subject: str(a.subject, 300), po: str(a.po, 60),
      recipients: { to: (a.recipients?.to || []).map((x) => str(x, 200)), cc: (a.recipients?.cc || []).map((x) => str(x, 200)) },
      lines, units: lines.reduce((s, l) => s + l.qty, 0), total: Number(a.total) || 0, source: 'ops web' }).select('id');
  },
  orders_list: () => db().from('ops_orders').select('id,sent_at,kind,subject,lines,units,total,status,closed_at,note,shipped_at,fba_plan,fba_ids,matched_at').order('sent_at', { ascending: false }).limit(300),
  log_list: () => db().from('ops_log').select('id,at,actor,action,detail,ref').order('at', { ascending: false }).order('id', { ascending: false }).limit(300),
  order_status: (a) => {
    const id = int(a.id);
    if (a.status === 'open') return db().from('ops_orders').update({ status: 'open', shipped_at: null, fba_plan: null, fba_ids: null, matched_at: null, closed_at: null }).eq('id', id);
    if (a.status === 'cancelled') return db().from('ops_orders').update({ status: 'cancelled', closed_at: now() }).eq('id', id);
    if (a.status === 'received') return db().from('ops_orders').update({ status: 'received', closed_at: now() }).eq('id', id);
    throw new Error('bad status');
  },
  inbound_page: (a) => {
    const days = Math.min(int(a.days), 400), off = int(a.offset);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return db().from('ops_inbound').select('id,channel,name,status,closed,created,dest,eta_start,eta_end,carrier,tracking,units,received,short,extra,items,updated_at')
      .gte('created', since).order('created', { ascending: false }).order('id', { ascending: false }).range(off, off + 399);
  },
  addresses: () => db().from('ops_addresses').select('key,country,label,uses,last_used').eq('hidden', false).order('last_used', { ascending: false, nullsFirst: false }),
  market_list: () => db().from('ops_market').select('channel,checked_at,tried_at,error,orders'),
  ship_start: (a) => {
    const p = a.payload || {};
    if (!['miami', 'china', 'walmart'].includes(p.source) || !Array.isArray(p.items) || !p.items.length || p.items.length > 1500) throw new Error('bad shipment');
    const payload = { source: p.source, address_key: str(p.address_key, 200), name: str(p.name, 40),
      items: p.items.map((i) => ({ msku: str(i.msku, 80), qty: int(i.qty) })), hold_id: p.hold_id == null ? null : int(p.hold_id) };
    return db().from('ops_refresh').insert({ requested_by: 'ops page', kind: 'ship', payload }).select('id');
  },
};
const WRITES = new Set(['pull_start', 'log_add', 'order_create', 'order_status', 'ship_start']);

export default async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  const s = await opsSession(req);
  if (!s) return err('login', 401);
  const f = await body(req);
  const fn = ACT[f.op];
  if (!fn) return err('unknown action', 400);
  if (WRITES.has(f.op) && req.headers.get('x-csrf') !== s.csrf) return err('Session check failed — reload the page.', 403);
  try {
    return json({ ok: true, rows: one(await fn(f.args || {})) });
  } catch (e) {
    return err(String(e.message || e), 400);
  }
};
