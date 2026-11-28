// To-do lists (/desk): one list per workstation (Operations, Catalog, Advertising), behind the Advertising PIN login.
// audience "operator" rows (written by the scanner, ~/command-center/collect/desk_scan.py) are nameless: any signed-in user
// can tick them. audience "owner" rows (the owner's own decisions, from desk_sync.py) and the Personal tab are for the
// owner role only: other users never receive them. Nothing about a task is ever in the published site files.
import { json, err, body } from '../lib/http.mjs';
import { db, dataset } from '../lib/supabase.mjs';
import { currentUser, can, csrfOk } from '../lib/auth.mjs';

const KEY = /^[0-9a-f]{16}$/;
const WS = 'bodyj4you';
const COLS = 'key,tab,station,audience,source,text,detail,link,project_name,area,due,since,mentions,state,snooze_until,done_at';
const day = (d) => d.toISOString().slice(0, 10);

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return json({ ok: false, error: 'Sign in.' }, 401);
  const owner = can(u, 'owner');
  const mine = (q) => (owner ? q : q.eq('audience', 'operator').eq('tab', 'business'));   // what this user may see or change

  if (req.method === 'GET') {
    const today = day(new Date());
    const weekAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    const [open, done, status] = await Promise.all([
      mine(db().from('desk_tasks').select(COLS).eq('workspace', WS))
        .or(`state.eq.open,and(state.eq.later,snooze_until.lte.${today})`).order('due', { nullsFirst: false }).order('key').limit(400),
      mine(db().from('desk_tasks').select('key,tab,station,audience,text,done_at').eq('workspace', WS)).eq('state', 'done')
        .gte('done_at', weekAgo).order('done_at', { ascending: false }).limit(200),
      dataset('desk_status', '_system').catch(() => null),
    ]);
    if (open.error || done.error) return err('The task list could not be read.', 500);
    return json({ ok: true, role: owner ? 'owner' : 'operator', csrf: u.csrf, tasks: open.data, done: done.data, status: owner ? status?.payload || null : { at: status?.payload?.at || null } });   // failing job names are the owner's only
  }

  if (req.method !== 'POST') return err('GET or POST only', 405);
  const f = (await body(req).catch(() => null)) || {};
  if (typeof f !== 'object' || !csrfOk(u, req, f)) return err('This page is out of date. Reload it.', 403);
  if (!KEY.test(String(f.key || ''))) return err('Unknown task.');
  const now = new Date();
  const change = {
    done: { state: 'done', done_at: now.toISOString(), snooze_until: null },
    undo: { state: 'open', done_at: null, snooze_until: null },
    later: { state: 'later', done_at: null, snooze_until: day(new Date(now.getTime() + 7 * 86400000)) },
    move: { state: 'moved', done_at: null, snooze_until: null },
  }[f.action];
  if (!change) return err('Unknown action.');
  if (f.action === 'move' && !owner) return err('Only the owner can send a task away.', 403);
  const { data, error } = await mine(db().from('desk_tasks').update({ ...change, state_at: now.toISOString() })
    .eq('key', f.key).eq('workspace', WS)).in('state', ['open', 'done', 'later', 'moved']).select('key');
  if (error) return err('That could not be saved.', 500);
  if (!data?.length) return err('This task is no longer on the list. Reload the page.', 404);
  return json({ ok: true });
};
