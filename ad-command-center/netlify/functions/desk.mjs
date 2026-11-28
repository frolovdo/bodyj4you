// My Desk (/desk): the owner's daily business tasks. Owner role only, behind the Advertising PIN login.
// Rows are written by the Workshop sync on the Mac (~/command-center/collect/desk_sync.py); this endpoint lists them and
// saves Done / Later / Undo / "Wrong place". Nothing about a task is ever in the published site files.
import { json, err, body } from '../lib/http.mjs';
import { db, dataset } from '../lib/supabase.mjs';
import { currentUser, can, csrfOk } from '../lib/auth.mjs';

const KEY = /^[0-9a-f]{16}$/;
const WS = 'bodyj4you';
const COLS = 'key,tab,text,project_name,area,due,since,mentions,state,snooze_until,done_at';
const day = (d) => d.toISOString().slice(0, 10);

export default async (req) => {
  const u = await currentUser(req);
  if (!u) return json({ ok: false, error: 'Sign in.' }, 401);
  if (!can(u, 'owner')) return err('My Desk is for the owner only.', 403);

  if (req.method === 'GET') {
    const today = day(new Date());
    const weekAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    const [open, done, status] = await Promise.all([
      db().from('desk_tasks').select(COLS).eq('workspace', WS).eq('assignee', 'owner')
        .or(`state.eq.open,and(state.eq.later,snooze_until.lte.${today})`).order('due', { nullsFirst: false }).order('key').limit(200),
      db().from('desk_tasks').select('key,tab,text,done_at').eq('workspace', WS).eq('assignee', 'owner').eq('state', 'done')
        .gte('done_at', weekAgo).order('done_at', { ascending: false }).limit(200),
      dataset('desk_status', '_system').catch(() => null),
    ]);
    if (open.error || done.error) return err('The task list could not be read.', 500);
    return json({ ok: true, user: u.name, csrf: u.csrf, tasks: open.data, done: done.data, status: status?.payload || null });
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
  const { data, error } = await db().from('desk_tasks').update({ ...change, state_at: now.toISOString() })
    .eq('key', f.key).eq('workspace', WS).eq('assignee', 'owner').in('state', ['open', 'done', 'later', 'moved']).select('key');
  if (error) return err('That could not be saved.', 500);
  if (!data?.length) return err('This task is no longer on the list. Reload the page.', 404);
  return json({ ok: true });
};
