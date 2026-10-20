import React, { useEffect, useState } from 'react';
import { api, FAM } from './App.jsx';

// Top of the Dashboard, in this order: Urgent (alarms), Today so far, Yesterday, Recent changes, Hypothesis pulse.
// Numbers come from the hourly feed and from Amazon directly (see /api/live, /api/review). Campaigns are ranked by sales.
const money = (v, d = 0) => (v == null || isNaN(v) ? '–' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const n0 = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString());
const short = (s) => s.replace(' - AI', '');
// Plain clock: '13:25' -> '1:25pm'; a 'YYYY-MM-DD HH:MM' stamp -> 'today 2:24am' / 'yesterday 1:58pm' / 'Oct 13, 11:04am'
const clock = (t) => { if (!t) return '–'; const m = /^(\d{1,2}):(\d{2})$/.exec(String(t)); if (!m) return t; const h = +m[1]; return `${h % 12 || 12}:${m[2]}${h < 12 ? 'am' : 'pm'}`; };
const hourWord = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(stamp, today, yday) { if (!stamp) return '–'; const s = String(stamp); const date = s.length >= 10 && s[4] === '-' ? s.slice(0, 10) : (s.length === 11 && s[2] === '-' ? `${today.slice(0, 4)}-${s.slice(0, 5)}` : null); const hm = s.slice(-5); if (!date) return clock(hm); const day = date === today ? 'today' : date === yday ? 'yesterday' : `${MON[+date.slice(5, 7) - 1]} ${+date.slice(8, 10)},`; return `${day} ${clock(hm)}`; }
const dayName = (ymd) => { const d = new Date(ymd + 'T12:00:00Z'); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };

function Delta({ p, up, small }) {
  if (p == null) return null;
  if (Math.abs(p) < 5) return <span className={'dl mut' + (small ? ' small' : '')}>flat</span>;
  const good = up === null || up === undefined ? null : (p > 0) === up;
  return <span className={'dl ' + (good === null ? 'mut' : good ? 'good' : 'bad') + (small ? ' small' : '')}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}%</span>;
}
const Cell = ({ v, fmt, p, up }) => <td><b>{fmt(v)}</b><div><Delta p={p} up={up} small /></div></td>;
// Section title: bold words, a few words of context, and the full explanation behind "what is this".
const H = ({ children, sub, about, tone }) => <div className="hd"><h2 className={'big ' + (tone || '')}>{children}</h2>{sub && <span className="mut small">{sub}</span>}{about && <details className="about"><summary className="small">what is this</summary><div className="small mut">{about}</div></details>}</div>;

export default function Now({ csrf, user, engine }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [rv, setRv] = useState(null);
  const [rvErr, setRvErr] = useState('');
  const [rvBusy, setRvBusy] = useState(false);
  const post = (path) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf }) });
  useEffect(() => {
    api('live').then((r) => (r.ok ? setD(r) : setErr(r.error || 'could not read the live numbers')));
    api('review').then((r) => (r.ok ? setRv(r) : setRvErr(r.error || 'could not build the review')));
  }, []);
  const refresh = async () => { setBusy(true); const r = await post('live'); setBusy(false); if (r.ok) { setD(r); setErr(''); } else setErr(r.error || 'could not read'); };
  const review = async () => { setRvBusy(true); const r = await post('review'); setRvBusy(false); if (r.ok) { setRv(r); setRvErr(''); } else setRvErr(r.error || 'could not build the review'); };

  const fires = (d?.alerts || []).filter((a) => a.level === 'fire');
  const watches = (d?.alerts || []).filter((a) => a.level === 'watch');
  const T = d?.totals;
  const hh = d && d.through_hour >= 0 ? hourWord(d.through_hour + 1) : null;

  return (
    <>
      <div className={'card now ' + (fires.length ? 'fire' : watches.length ? 'warnb' : 'calm')}>
        <div className="nowhead">
          <h2 className={'big ' + (fires.length ? 'bad' : '')}>{fires.length ? `Urgent: ${fires.length}` : 'Urgent: none'}</h2>
          <span className="mut small">{watches.length ? `${watches.length} to watch · ` : ''}{d ? `checked ${when(d.at, d.today, d.yday)}${d.cached ? ' (cached)' : ''}` : err ? '' : 'reading…'}</span>
          <span className="btns">
            <button className="btn alt sm" onClick={refresh} disabled={busy}>{busy ? 'Reading Amazon…' : 'Refresh live numbers'}</button>
            {engine && !engine.paused && <button className="btn alt sm" onClick={engine.start} disabled={engine.paused || engine.starting || engine.waiting} title={engine.paused ? 'Out of credits for manual refresh' : undefined}>{engine.paused ? 'Refresh daily data (off)' : engine.starting ? 'Starting…' : engine.waiting ? 'Daily refresh running…' : 'Refresh daily data'}</button>}
            <button className="btn alt sm" onClick={review} disabled={rvBusy}>{rvBusy ? 'Reviewing…' : 'Review hypotheses now'}</button>
          </span>
        </div>
        {engine?.msg && <div className="small mut">{engine.msg}</div>}
        {engine?.choice && (
          <div className="ask small">
            <div>{engine.choice.text}</div>
            <div className="row">
              <button className="btn sm" disabled={engine.starting || engine.waiting} onClick={() => engine.choice.pick('light')}>Today's spend only ({engine.choice.lightMin})</button>
              <button className="btn alt sm" disabled={engine.starting || engine.waiting} onClick={() => engine.choice.pick('all')}>Everything ({engine.choice.fullMin})</button>
              <button className="btn alt sm" onClick={engine.choice.cancel}>Cancel</button>
            </div>
          </div>)}
        {err && <div className="block small">{err}</div>}
        {d && !fires.length && !watches.length && <p className="small" style={{ margin: '6px 0 0' }}>All normal as of {when(d.at, d.today, d.yday)}.</p>}
        {(fires.length > 0 || watches.length > 0) && <ul className="al">{[...fires, ...watches].map((a, i) => (
          <li key={i} className={a.level}><details><summary><b>{a.headline || a.text}</b></summary>
            <div className="ctx"><div>{a.text}</div>{a.detail && <div className="small">{a.detail}</div>}<a className="small" href={a.link}>{a.link === '#/history' ? 'Open History →' : a.link === '#/hourly' ? 'Open Hourly →' : a.link === '#/update' ? 'Open Update campaigns →' : ''}</a></div></details></li>))}</ul>}
      </div>

      {d && (
        <div className="card">
          <H sub={hh ? `data to ${hh}` : 'no data from today yet'} about={`Spend and clicks from the hourly feed, which runs about ${d.feed_lag_h != null ? d.feed_lag_h : 1} hour behind: the newest complete hour is up to ${hh || '–'}. Each number is against the usual for the same hours over the 7 days before. Budget used is live from Amazon.`}>Today so far</H>
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
          <H sub={dayName(d.yday)} about={`Pacific day, campaigns ranked by their share of ad sales over the last 30 matured days (shown under each name). The small arrow under each number is the move against the usual for the 7 days before. Orders and sales still fill in for days (orders are in up to ${d.last_conv ? when(d.last_conv + ':00', d.today, d.yday).replace(':00', '') : '–'}), so they read low for now.`}>Yesterday</H>
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
          <summary><H sub={`${d.watch.length} send${d.watch.length === 1 ? '' : 's'}, ${[...new Set(d.watch.flatMap((w) => w.campaigns.map((c) => c.name)))].length} campaigns, last 3 days`}>Recent changes</H></summary>
          <p className="small mut" style={{ margin: '0 0 6px' }}>How each changed campaign reads since the change, against the same hours over the 7 days before.</p>
          {d.watch.map((w, i) => (
            <div className="wb" key={i}><div className="small"><b>{when(w.at, d.today, d.yday)}</b> · {w.who} · {w.ok} change{w.ok === 1 ? '' : 's'}{w.already ? `, ${w.already} already there` : ''}{w.failed ? <span className="bad">, {w.failed} failed</span> : ''} · {w.hours} h ago{w.id ? <> · <a href="#/history">History</a></> : ''}</div>
              <ul className="small wl">{w.campaigns.map((c, j) => (
                <li key={j}><b>{short(c.name)}</b> ({c.n}: {c.changes.slice(0, 3).join('; ')}{c.n > 3 ? '; …' : ''}) → spent {money(c.since.spend)} vs usual {money(c.usual.spend)} · {n0(c.since.clicks)} clicks vs {n0(c.usual.clicks)} · {c.since.cpc != null ? `${money(c.since.cpc, 2)} a click vs ${c.usual.cpc != null ? money(c.usual.cpc, 2) : '–'}` : 'no clicks yet'} · {n0(c.since.orders)} orders vs {c.usual.orders}{c.flags.length ? <b className="bad"> · {c.flags.join(', ')}</b> : ''}</li>))}</ul></div>))}
          {w_too_early(d.watch) && <div className="small mut">Under 24 hours is too early to read anything but a stop; orders need 3 days.</div>}
        </details>)}

      <details className="card fold">
        <summary><H sub={rv ? pulseCounts(rv) || `${rv.items.length} change sets` : rvErr ? '' : 'reviewing…'}>Hypothesis pulse</H></summary>
        <p className="small mut" style={{ margin: '0 0 6px' }}>Is each change doing what we said it would? Click a campaign for the numbers since the change and the read so far.{rv ? ` Reviewed ${when(rv.at, d?.today, d?.yday)}.` : ''}</p>
        {rvErr && <div className="block small">{rvErr}</div>}
        {rv && !rv.items.length && <p className="mut small">No change sets inside their review window.</p>}
        {rv?.items.map((it, i) => (
          <div className="pulse" key={i}>
            <div className="small"><b>{when(it.at, d?.today, d?.yday)}</b> · {it.who}{it.id ? <> · <a href="#/history">History</a></> : ''}</div>
            {it.entries.map((e, j) => (
              <details className="pe" key={j}><summary><b>{short(e.campaign)}</b> <span className={'pill st ' + e.status.replace(/\s/g, '')}>{e.status}</span> <span className="mut small">“{e.hypothesis.length > 60 ? e.hypothesis.slice(0, 60) + '…' : e.hypothesis}”</span></summary>
                <p>{e.sentences.join(' ')}</p></details>))}
          </div>))}
        {rv && (rv.share != null || rv.rank != null) && <div className="small mut">Market pulse from the weekly scoreboard: share of '{FAM.head}' purchases {rv.share != null ? rv.share.toFixed(1) + '%' : '–'}, organic rank #{rv.rank ?? '–'} (both lag; see the scoreboard below).</div>}
      </details>
    </>
  );
}

const w_too_early = (w) => (w || []).some((x) => x.hours < 24);
function pulseCounts(rv) {
  const c = {};
  for (const it of rv.items || []) for (const e of it.entries) c[e.status] = (c[e.status] || 0) + 1;
  const parts = Object.entries(c).map(([k, v]) => `${v} ${k}`);
  return parts.join(', ');
}
