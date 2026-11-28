// To-do lists (/desk): one shared list per workstation (Operations, Catalog, Advertising), behind the PIN login.
// Built like the Operations "Today" page: the same list for everyone, biggest first, with On it / Done / Later / Not relevant.
// The PIN says who acted: the user's name is kept on the task (actor) and every press goes to the audit table.
// Rows: audience "operator" = shared (written by the scanner, ~/command-center/collect/desk_scan.py); audience "owner" =
// notes from the owner's own work sessions and his Personal tab (desk_sync.py): only the owner role ever receives those.
// Nothing about a task is ever in the published site files.
import { json, err, body } from '../lib/http.mjs';
import { db, dataset, audit } from '../lib/supabase.mjs';
import { currentUser, can, csrfOk } from '../lib/auth.mjs';

const KEY = /^[0-9a-f]{16}$/;
const WS = 'bodyj4you';
const COLS = 'key,tab,station,audience,source,text,detail,link,project_name,due,since,mentions,rank,state,snooze_until,done_at,state_at,actor';
const day = (d) => d.toISOString().slice(0, 10);

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return json({ ok: false, error: 'Sign in.' }, 401);
  const owner = can(u, 'owner');
  const mine = (q) => (owner ? q : q.eq('audience', 'operator').eq('tab', 'business'));   // what this user may see or change

  if (req.method === 'GET') {
    const today = day(new Date());
    const weekAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    const [open, done, log, status] = await Promise.all([
      mine(db().from('desk_tasks').select(COLS).eq('workspace', WS))
        .or(`state.in.(open,doing),and(state.eq.later,snooze_until.lte.${today})`).order('rank', { ascending: false, nullsFirst: false }).order('key').limit(400),
      mine(db().from('desk_tasks').select('key,tab,station,audience,text,done_at,actor').eq('workspace', WS)).eq('state', 'done')
        .gte('done_at', weekAgo).order('done_at', { ascending: false }).limit(200),
      (owner ? db().from('audit').select('at,user_name,action,item,detail').like('action', 'todo_%')
        : db().from('audit').select('at,user_name,action,item,detail').like('action', 'todo_%').not('item', 'like', 'owner:%'))
        .order('at', { ascending: false }).limit(60),
      dataset('desk_status', '_system').catch(() => null),
    ]);
    if (open.error || done.error) return err('The list could not be read.', 500);
    // the log names the task in "detail": a non-owner only gets lines about shared tasks (item starts with the station)
    const lines = (log.data || []).filter((l) => owner || !String(l.item || '').startsWith('owner:'));
    return json({ ok: true, role: owner ? 'owner' : 'operator', user: u.name, csrf: u.csrf, tasks: open.data, done: done.data, log: lines,
      status: owner ? status?.payload || null : { at: status?.payload?.at || null } });   // failing job names are the owner's only
  }

  if (req.method !== 'POST') return err('GET or POST only', 405);
  const f = (await body(req).catch(() => null)) || {};
  if (typeof f !== 'object' || !csrfOk(u, req, f)) return err('This page is out of date. Reload it.', 403);
  if (!KEY.test(String(f.key || ''))) return err('Unknown task.');
  const now = new Date();
  const change = {
    doing: { state: 'doing', done_at: null, snooze_until: null },
    done: { state: 'done', done_at: now.toISOString(), snooze_until: null },
    undo: { state: 'open', done_at: null, snooze_until: null },
    later: { state: 'later', done_at: null, snooze_until: day(new Date(now.getTime() + 7 * 86400000)) },
    move: { state: 'moved', done_at: null, snooze_until: null },                 // "Not relevant"
  }[f.action];
  if (!change) return err('Unknown action.');
  const { data, error } = await mine(db().from('desk_tasks').update({ ...change, state_at: now.toISOString(), actor: u.name })
    .eq('key', f.key).eq('workspace', WS)).in('state', ['open', 'doing', 'done', 'later', 'moved']).select('key,text,station,audience,tab');
  if (error) return err('That could not be saved.', 500);
  if (!data?.length) return err('This task is no longer on the list. Reload the page.', 404);
  const t = data[0];
  const where = t.audience === 'owner' ? 'owner:' + (t.tab === 'personal' ? 'personal' : t.station || '') : t.station || '';
  await audit(u, 'todo_' + f.action, where, t.text).catch(() => {});             // who pressed what: the PIN is the signature
  return json({ ok: true });
};
