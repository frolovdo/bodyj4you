import React, { useEffect, useState } from 'react';
import { api, FAM } from './App.jsx';
import { go } from './Account.jsx';

// The Dashboard since the 2026-11-09 redesign: one question, "what is today's one move on this family, and is it safe to send?"
//   1. status line: goal by purchases, three numbers, how fresh the data is (never folded)
//   2. Urgent: only when a real fire exists (live.mjs alarms above the money threshold)
//   3. Today's move: the engine's one recommended action (ac_today.py) with Why / Expected / Risk / Stops if / Judge on and a Stage button
//   4. Watch today: out of budget now, holds, owner decisions waiting, watch-level alarms
//   5. Since the last change: the hypothesis pulse in three lines
//   6. More: today by campaign, yesterday's table, the engine's scoreboard / strategies / context, refresh buttons
// Nothing here sends anything: Stage opens Update campaigns with the values filled in; the send still needs review and confirmation.
const money = (v, d = 0) => (v == null || isNaN(v) ? '–' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const n0 = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString());
const short = (s) => String(s || '').replace(' - AI', '');
const clock = (t) => { if (!t) return '–'; const m = /^(\d{1,2}):(\d{2})$/.exec(String(t)); if (!m) return t; const h = +m[1]; return `${h % 12 || 12}:${m[2]}${h < 12 ? 'am' : 'pm'}`; };
const hourWord = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (ymd) => (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd) ? `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}` : ymd || '–');
function when(stamp, today, yday) { if (!stamp) return '–'; const s = String(stamp); const date = s.length >= 10 && s[4] === '-' ? s.slice(0, 10) : (s.length === 11 && s[2] === '-' ? `${(today || '').slice(0, 4)}-${s.slice(0, 5)}` : null); const hm = s.slice(-5); if (!date) return clock(hm); const day = date === today ? 'today' : date === yday ? 'yesterday' : `${md(date)},`; return `${day} ${clock(hm)}`; }
const dayName = (ymd) => { const d = new Date(ymd + 'T12:00:00Z'); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };

function Delta({ p, up, small }) {
  if (p == null) return null;
  if (Math.abs(p) < 5) return <span className={'dl mut' + (small ? ' small' : '')}>flat</span>;
  const good = up === null || up === undefined ? null : (p > 0) === up;
  return <span className={'dl ' + (good === null ? 'mut' : good ? 'good' : 'bad') + (small ? ' small' : '')}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}%</span>;
}
const Cell = ({ v, fmt, p, up }) => <td><b>{fmt(v)}</b><div><Delta p={p} up={up} small /></div></td>;

// ---------------------------------------------------------------- 1. status line
function Status({ t, live, engine, actions }) {
  const g = t?.goal, n = t?.numbers, f = t?.data;
  const WORD = { win: ['Winning', 'good'], met: ['Goal met', 'warn'], behind: ['Behind', 'bad'] };
  const goal = g ? (() => { const [w, c] = WORD[g.state] || ['', 'mut']; return <span>'{g.term}': <b className={c}>{w}</b> {g.state === 'met' ? `#${g.position_set} by purchases, aiming #${g.position}` : `goal #${g.position}${g.pos ? `, now #${g.pos}` : ''}`} · {g.now_day} of {g.units_day} units/day{g.state === 'win' ? '' : ` (${g.pct}%)`}</span>; })()
    : <span className="mut">no goal set for this family yet</span>;
  const vs30 = n?.orders_vs30 == null ? '' : Math.abs(n.orders_vs30) < 5 ? ', flat vs 30 days' : `, ${n.orders_vs30 > 0 ? 'up' : 'down'} ${Math.abs(n.orders_vs30)}% vs 30 days`;
  const fresh = f ? [`spend through ${md(f.spend_through)}`, `orders judged through ${md(f.judged_through)}`, f.rank_stale_days != null && f.rank_stale_days > 7 ? `rank data ${f.rank_stale_days} days old (resets ${md(f.h10_reset)})` : null].filter(Boolean).join(' · ') : '';
  return (
    <div className="card status">
      <div className="st1">{goal}</div>
      {n && <div className="st2 small">{n.orders_day != null && <span><b>{n.orders_day}</b> ad orders a day{vs30}</span>}{n.acos != null && <span><b>{money(n.acos)}</b> per $100 of ad sales <span className="mut">(target {money(n.target)}, break-even {money(n.breakeven)})</span></span>}{n.tacos != null && <span>ads <b>{n.tacos}%</b> of all revenue <span className="mut">(aim {n.tacos_aim}%)</span></span>}</div>}
      <div className="st3 small mut">{fresh}{live?.at ? `${fresh ? ' · ' : ''}live numbers ${when(live.at, live.today, live.yday)}` : ''}{!t && ' · today\'s move not built yet for this family: it arrives with the next engine run'}</div>
      <div className="st4" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <button className="btn alt sm" onClick={actions.refresh} disabled={actions.busy}>{actions.busy ? 'Reading Amazon…' : 'Get live numbers'}</button>
        {engine && !engine.paused && <button className="btn alt sm" onClick={engine.start} disabled={engine.paused || engine.starting || engine.waiting}>{engine.starting ? 'Starting…' : engine.waiting ? 'Daily refresh running…' : 'Get daily data'}</button>}
        {engine?.msg && <span className="small mut">{engine.msg}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3. today's move
function Changes({ rows }) {
  if (!rows?.length) return null;
  return <div className="wrap"><table className="kw mv"><thead><tr><th>Where</th><th>Setting</th><th>Now</th><th>Becomes</th></tr></thead><tbody>{rows.map((c, i) => <tr key={i}><td>{short(c.campaign)}</td><td>{c.setting}</td><td>{c.now}</td><td><b>{c.to}</b></td></tr>)}</tbody></table></div>;
}
function Lines({ m }) {
  const L = [['Why', m.why], ['Expected', m.expected], ['Risk', m.risk], ['Stops if', m.stop], ['Judge on', m.judge_on ? `${md(m.judge_on)} (${m.judge_days} days)` : null]].filter(([, v]) => v);
  return <div className="mv-ev">{L.map(([k, v]) => <React.Fragment key={k}><span className="k">{k}</span><span>{v}</span></React.Fragment>)}</div>;
}
function StageBtn({ m, cta }) {
  // the why box on Update starts with the engine's own hypothesis (title + expected effect); the operator can still edit it before sending
  const why = `${m.why_param || m.title}${m.expected ? `. Expected: ${m.expected.slice(0, 160)}` : ''}`;
  if (m.set) return <a className={'btn' + (cta ? ' cta' : ' ghost')} style={{ textDecoration: 'none' }} href={`#/update?set=${encodeURIComponent(m.set)}&why=${encodeURIComponent(why)}`}>Stage this change</a>;
  if (m.link) return <a className={'btn' + (cta ? ' cta' : ' ghost')} style={{ textDecoration: 'none' }} href={m.link}>Open the Keywords page</a>;
  return null;
}
function Move({ t }) {
  if (!t) return null;
  const m = t.move, alts = t.alternatives || [];
  if (!m) return (
    <div className="card move none">
      <div className="lbl">Today's move</div>
      <h2 className="big">No action today</h2>
      <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{(t.none_reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
      <div className="small mut" style={{ marginTop: 6 }}>Next changes day {md(t.next_changes_day)}. Nothing is sent to Amazon by itself.</div>
      {alts.length > 0 && <details className="fold" style={{ marginTop: 8 }}><summary className="small"><span className="lbl">{alts.length} learning bet{alts.length === 1 ? '' : 's'}, not recommended as today's move</span></summary>{alts.map((a, i) => <div className="alt" key={i}><b>{a.title}</b><Lines m={a} /><StageBtn m={a} /></div>)}</details>}
    </div>);
  return (
    <div className="card move">
      <div className="lbl">Today's move <span className="mut">· {m.source}{m.uncertain ? ' · uncertain: projected, not measured' : ''}</span></div>
      <h2 className="big">{m.title}</h2>
      <Changes rows={m.changes} />
      <Lines m={m} />
      <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><StageBtn m={m} cta /><span className="small mut">Stage fills the values in on Update campaigns; you still review, write why and confirm before anything is sent.</span></div>
      {alts.length > 0 && <details className="fold" style={{ marginTop: 10 }}><summary className="small"><span className="lbl">{alts.length} other option{alts.length === 1 ? '' : 's'}</span></summary>{alts.map((a, i) => <div className="alt" key={i}><b>{a.title}</b>{a.learning && <span className="pill">learning bet</span>}<Changes rows={a.changes} /><Lines m={a} /><StageBtn m={a} /></div>)}</details>}
      <div className="small mut" style={{ marginTop: 8 }}>Built {t.built_at} PT from data through {md(t.data?.spend_through)}; orders judged through {md(t.data?.judged_through)}.</div>
    </div>);
}

// ---------------------------------------------------------------- 2 + 4. urgent and watch
function Alerts({ list, today, yday }) {
  return <ul className="al">{list.map((a, i) => (
    <li key={i} className={a.level}><details><summary><b>{a.headline || a.text}</b></summary>
      <div className="ctx"><div>{a.text}</div>{a.detail && <div className="small">{a.detail}</div>}{a.link && <a className="small" href={a.link}>{a.link === '#/history' ? 'Open History →' : a.link === '#/hourly' ? 'Open Hourly →' : a.link === '#/update' ? 'Open Update campaigns →' : ''}</a>}</div></details></li>))}</ul>;
}
function Watch({ t, live }) {
  const items = [];
  for (const r of live?.today_rows || []) if (r.outNow && r.state === 'ENABLED') items.push({ text: `${short(r.name)} is out of budget${r.outSince ? ` since ${clock(r.outSince)}` : ''}`, detail: `${r.usedPct != null ? Math.round(r.usedPct) + '% of ' : ''}${money(r.budget)} used; no clicks until midnight unless the budget is raised.`, link: '#/update' });
  for (const a of (live?.alerts || []).filter((a) => a.level === 'watch')) items.push({ text: a.headline || a.text, detail: a.text !== a.headline ? a.text : a.detail, link: a.link });
  for (const w of t?.watch || []) items.push({ text: w.text, detail: w.detail, link: w.link, stale: w.stale });
  const head = items.slice(0, 4), rest = items.slice(4);
  return (
    <div className="card">
      <div className="lbl">Watch today</div>
      {!items.length && <p className="small" style={{ margin: 0 }}>All normal{live?.at ? ` as of ${when(live.at, live.today, live.yday)}` : ''}.</p>}
      {head.length > 0 && <ul className="watchl">{head.map((w, i) => <li key={i}><b className={w.stale ? 'mut' : ''}>{w.text}</b>{w.detail && <span className="small mut"> {w.detail}</span>}{w.link && <a className="small" href={w.link}> →</a>}</li>)}</ul>}
      {rest.length > 0 && <details className="fold"><summary className="small"><span className="lbl">{rest.length} more</span></summary><ul className="watchl">{rest.map((w, i) => <li key={i}><b className={w.stale ? 'mut' : ''}>{w.text}</b>{w.detail && <span className="small mut"> {w.detail}</span>}{w.link && <a className="small" href={w.link}> →</a>}</li>)}</ul></details>}
    </div>);
}

// ---------------------------------------------------------------- 5. since the last change (hypothesis pulse, three lines)
function Since({ rv, live }) {
  const rows = [];
  for (const it of rv?.items || []) for (const e of it.entries) rows.push({ at: it.at, who: it.who, id: it.id, ...e });
  if (!rows.length) return null;
  const Row = ({ e }) => <li><b>{short(e.campaign)}</b> <span className={'pill st ' + String(e.status).replace(/\s/g, '')}>{e.status}</span> <span className="small mut">{when(e.at, live?.today, live?.yday)} · “{e.hypothesis.length > 70 ? e.hypothesis.slice(0, 70) + '…' : e.hypothesis}”</span>{e.id && <a className="small" href="#/history"> History →</a>}</li>;
  return (
    <div className="card">
      <div className="lbl">Since the last change <span className="mut">· {rows.length} campaign{rows.length === 1 ? '' : 's'} inside their review window</span></div>
      <ul className="watchl">{rows.slice(0, 3).map((e, i) => <Row e={e} key={i} />)}</ul>
      {rows.length > 3 && <details className="fold"><summary className="small"><span className="lbl">{rows.length - 3} more</span></summary><ul className="watchl">{rows.slice(3).map((e, i) => <Row e={e} key={i} />)}</ul></details>}
    </div>);
}

// ---------------------------------------------------------------- 6. more
function More({ d, rv, page, engine, actions }) {
  const T = d?.totals;
  const hh = d && d.through_hour >= 0 ? hourWord(d.through_hour + 1) : null;
  const age = page?.produced_at ? Math.round((Date.now() - new Date(page.produced_at)) / 60000) : null;
  return (
    <details className="card fold more">
      <summary><span className="lbl">More: today by campaign, yesterday's table, scoreboard, strategies, context, data, check recent changes</span></summary>
      <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        <button className="btn alt sm" onClick={actions.review} disabled={actions.rvBusy}>{actions.rvBusy ? 'Checking…' : 'Check recent changes'}</button>
        <span className="small mut">Daily analysis produced {age === null ? '–' : age < 60 ? `${age} min ago` : `${Math.round(age / 60)} h ago`}{page?.data_through ? ` · data through ${page.data_through}` : ''}.</span>
      </div>
      {engine?.choice && (
        <div className="ask small">
          <div>{engine.choice.text}</div>
          <div className="row">
            <button className="btn sm" disabled={engine.starting || engine.waiting} onClick={() => engine.choice.pick('light')}>Today's spend only ({engine.choice.lightMin})</button>
            <button className="btn alt sm" disabled={engine.starting || engine.waiting} onClick={() => engine.choice.pick('all')}>Everything ({engine.choice.fullMin})</button>
            <button className="btn alt sm" onClick={engine.choice.cancel}>Cancel</button>
          </div>
        </div>)}
      {actions.err && <div className="block small">{actions.err}</div>}
      {d && (
        <div className="card">
          <div className="hd"><h2 className="big">Today so far</h2><span className="mut small">{hh ? `real hourly data to ${hh}, each number against the usual for the same hours over the 7 days before` : 'no data from today yet'}</span></div>
          <div className="hz">{d.today_rows.filter((r) => r.state === 'ENABLED' || r.spent).map((r) => (
            <div className={'chip' + (r.outNow ? ' out' : '')} key={r.cid}><div className="n">{short(r.name)}</div>
              <b>{money(r.spent)} <span className="mut small">usual {money(r.usual)}</span></b>
              <div className="n">{n0(r.clicks)} clicks (usual {n0(r.usualClicks)}){r.cpc != null ? ` · ${money(r.cpc, 2)} a click` : ''}</div>
              <div className="n">{r.usedPct != null ? <><b className={r.usedPct >= 98 ? 'bad' : ''}>{Math.round(r.usedPct)}%</b> of {money(r.budget)} used</> : r.budget ? `budget ${money(r.budget)}` : 'banner (not edited here)'}{r.outNow ? <b className="bad"> · out since {clock(r.outSince)}</b> : ''}</div>
            </div>))}</div>
          {T && <div className="small mut" style={{ marginTop: 6 }}>All together: {money(T.t.spend)} spent by {hh || 'now'}, usual {money(T.tu.spend)} · {n0(T.t.clicks)} clicks, usual {n0(T.tu.clicks)}.</div>}
        </div>)}
      {d && (
        <div className="card">
          <div className="hd"><h2 className="big">Yesterday</h2><span className="mut small">{dayName(d.yday)} · campaigns ranked by share of ad sales (30 days) · arrows against the 7 days before · orders still fill in for days</span></div>
          <div className="wrap"><table className="kt yd"><thead><tr><th>Campaign</th><th>Spend</th><th>Clicks</th><th>Cost per click</th><th>Orders</th><th>Sales</th><th>Ad cost per $100</th><th>Budget used</th><th>Out of budget</th></tr></thead><tbody>
            {d.yesterday.map((r) => (
              <tr key={r.cid} className={r.state !== 'ENABLED' ? 'mut' : ''}>
                <td><b>{short(r.name)}</b>{r.state !== 'ENABLED' && <span className="pill">{r.state}</span>}<div className="small mut">{r.share30 != null ? `${r.share30}% of ad sales · ` : ''}shown {n0(r.imp)} <Delta p={r.vs.imp} up={true} small /></div></td>
                <Cell v={r.spend} fmt={(v) => money(v)} p={r.vs.spend} up={null} />
                <Cell v={r.clicks} fmt={n0} p={r.vs.clicks} up={true} />
                <Cell v={r.cpc} fmt={(v) => money(v, 2)} p={r.vs.cpc} up={false} />
                <Cell v={r.orders} fmt={n0} p={r.vs.orders} up={true} />
                <Cell v={r.sales} fmt={(v) => money(v)} p={r.vs.sales} up={true} />
                <td><b>{r.acos == null ? (r.spend ? 'no sales yet' : '–') : money(r.acos)}</b><div className="small mut">7d {r.base.acos == null ? '–' : money(r.base.acos)}</div></td>
                <td><b>{r.usedPct == null ? '–' : r.usedPct + '%'}</b><div className="small mut">of {money(r.budget)}</div></td>
                <td>{r.outAt ? <><b className="bad">{clock(r.outAt)}</b><div className="small mut">{r.hoursOut} h out{r.base.outAt ? `, usually ${clock(r.base.outAt)}` : ', usually lasts all day'}</div></> : <span className="good">in budget all day</span>}</td>
              </tr>))}
            {T && <tr className="tot"><td><b>All campaigns</b><div className="small mut">shown {n0(T.y.imp)} <Delta p={T.b.imp ? Math.round((100 * (T.y.imp - T.b.imp)) / T.b.imp) : null} up={true} small /></div></td>
              <Cell v={T.y.spend} fmt={(v) => money(v)} p={T.b.spend ? Math.round((100 * (T.y.spend - T.b.spend)) / T.b.spend) : null} up={null} />
              <Cell v={T.y.clicks} fmt={n0} p={T.b.clicks ? Math.round((100 * (T.y.clicks - T.b.clicks)) / T.b.clicks) : null} up={true} />
              <Cell v={T.y.cpc} fmt={(v) => money(v, 2)} p={T.b.cpc ? Math.round((100 * (T.y.cpc - T.b.cpc)) / T.b.cpc) : null} up={false} />
              <Cell v={T.y.orders} fmt={n0} p={T.b.orders ? Math.round((100 * (T.y.orders - T.b.orders)) / T.b.orders) : null} up={true} />
              <Cell v={T.y.sales} fmt={(v) => money(v)} p={T.b.sales ? Math.round((100 * (T.y.sales - T.b.sales)) / T.b.sales) : null} up={true} />
              <td><b>{T.y.acos == null ? '–' : money(T.y.acos)}</b><div className="small mut">7d {T.b.acos == null ? '–' : money(T.b.acos)}</div></td><td colSpan={2} className="small mut">day before: {money(T.p.spend)} spent, {n0(T.p.clicks)} clicks, {n0(T.p.orders)} orders</td></tr>}
          </tbody></table></div>
        </div>)}
      {d?.watch?.length > 0 && (
        <details className="card fold">
          <summary><span className="lbl">Recent changes: {d.watch.length} send{d.watch.length === 1 ? '' : 's'}, last 3 days, how each campaign reads since</span></summary>
          {d.watch.map((w, i) => (
            <div className="wb" key={i}><div className="small"><b>{when(w.at, d.today, d.yday)}</b> · {w.who} · {w.ok} change{w.ok === 1 ? '' : 's'}{w.already ? `, ${w.already} already there` : ''}{w.failed ? <span className="bad">, {w.failed} failed</span> : ''} · {w.hours} h ago{w.id ? <> · <a href="#/history">History</a></> : ''}</div>
              <ul className="small wl">{w.campaigns.map((c, j) => (
                <li key={j}><b>{short(c.name)}</b> ({c.n}: {c.changes.slice(0, 3).join('; ')}{c.n > 3 ? '; …' : ''}) → spent {money(c.since.spend)} vs usual {money(c.usual.spend)} · {n0(c.since.clicks)} clicks vs {n0(c.usual.clicks)} · {c.since.cpc != null ? `${money(c.since.cpc, 2)} a click vs ${c.usual.cpc != null ? money(c.usual.cpc, 2) : '–'}` : 'no clicks yet'} · {n0(c.since.orders)} orders vs {c.usual.orders}{c.flags.length ? <b className="bad"> · {c.flags.join(', ')}</b> : ''}</li>))}</ul></div>))}
          {(d.watch || []).some((x) => x.hours < 24) && <div className="small mut">Under 24 hours is too early to read anything but a stop; orders need 3 days.</div>}
        </details>)}
      {rv?.items?.length > 0 && (
        <details className="card fold">
          <summary><span className="lbl">Our changes so far: {pulseCounts(rv)}</span></summary>
          {rv.items.map((it, i) => (
            <div className="pulse" key={i}>
              <div className="small"><b>{when(it.at, d?.today, d?.yday)}</b> · {it.who}{it.id ? <> · <a href="#/history">History</a></> : ''}</div>
              {it.entries.map((e, j) => (
                <details className="pe" key={j}><summary><b>{short(e.campaign)}</b> <span className={'pill st ' + e.status.replace(/\s/g, '')}>{e.status}</span> <span className="mut small">“{e.hypothesis.length > 60 ? e.hypothesis.slice(0, 60) + '…' : e.hypothesis}”</span></summary>
                  <p>{e.sentences.join(' ')}</p></details>))}
            </div>))}
        </details>)}
      {page?.html && <>{page.css && <style dangerouslySetInnerHTML={{ __html: page.css }} />}<div className="engine" dangerouslySetInnerHTML={{ __html: page.html }} /></>}
      {!page?.html && <div className="card"><p className="mut">The engine's scoreboard and context for this family are not published yet.</p></div>}
      <p className="mut small" style={{ margin: '8px 0 0' }}>The daily ads brief for all families is on the <a href="#" onClick={(e) => { e.preventDefault(); go('ACCOUNT'); }}>Whole account</a> page (first entry in the family menu).</p>
    </details>);
}
function pulseCounts(rv) {
  const c = {};
  for (const it of rv.items || []) for (const e of it.entries) c[e.status] = (c[e.status] || 0) + 1;
  return Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ');
}

// ---------------------------------------------------------------- the page
export default function Today({ csrf, engine, page }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [rv, setRv] = useState(null);
  const [rvBusy, setRvBusy] = useState(false);
  const [t, setT] = useState(undefined);   // today_move payload; null when the engine has not built one yet
  const post = (path) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf }) });
  useEffect(() => {
    api('today').then((r) => setT(r.ok ? r.today : null));
    api('live').then((r) => (r.ok ? setD(r) : setErr(r.error || 'could not read the live numbers')));
    api('review').then((r) => { if (r.ok) setRv(r); });
  }, []);
  const refresh = async () => { setBusy(true); const r = await post('live'); setBusy(false); if (r.ok) { setD(r); setErr(''); } else setErr(r.error || 'could not read'); };
  const review = async () => { setRvBusy(true); const r = await post('review'); setRvBusy(false); if (r.ok) setRv(r); };
  const fires = (d?.alerts || []).filter((a) => a.level === 'fire');
  return (
    <>
      <Status t={t} live={d} engine={engine} actions={{ refresh, busy }} />
      {fires.length > 0 && <div className="card now fire"><div className="nowhead"><h2 className="big bad">Urgent: {fires.length}</h2><span className="mut small">checked {when(d.at, d.today, d.yday)}{d.cached ? ' (cached)' : ''}</span></div><Alerts list={fires} /></div>}
      {err && !d && <div className="card block small">{err}</div>}
      {t === undefined ? <div className="card move"><div className="lbl">Today's move</div><p className="mut" style={{ margin: 0 }}>Loading…</p></div> : <Move t={t} />}
      <Watch t={t} live={d} />
      <Since rv={rv} live={d} />
      <More d={d} rv={rv} page={page} engine={engine} actions={{ refresh, busy, review, rvBusy, err }} />
    </>
  );
}
