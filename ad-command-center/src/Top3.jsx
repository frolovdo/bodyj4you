import React, { useEffect, useMemo, useState } from 'react';
import { api } from './App.jsx';

// Top 3 by search: for each tracked search, the three ASINs Amazon shoppers click most (Brand Analytics: click share and
// purchase share of the whole query) next to us (Search Query Performance), week by week. Position is by purchase share.
// Data: dataset <family>/top3 from the engine (adsops/ac_top3.py), weekly.
const COL = ['var(--q-protect)', 'var(--q-maintain)', 'var(--q-investigate)', 'var(--q-evaluate)'];   // us, then the top 3 in order
const pct = (v, d = 1) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(d) + '%');
const num = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString());
const short = (t) => (t || '').replace(/\s*[|,(-].*$/, '').split(' ').slice(0, 3).join(' ');
const wk = (w) => { const d = new Date(w + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };

// our row and the latest top 3 as table rows for one week
function rows(t, w, ourLabel) {
  const e = t.weeks[w] || {};
  const top = (e.top || []).slice(0, 3);
  const mk = e.mkt_cvr;   // query-wide conversion %, from SQP
  const out = top.map((x, i) => ({
    key: x.asin, label: x.ours ? ourLabel : (x.brand || short(x.name) || x.asin), sub: x.asin, ours: x.ours, pos: i + 1, color: COL[i + 1],
    click: x.click, purch: x.conv, cvr: x.ours && e.our_clicks ? 100 * e.our_purch / e.our_clicks : (x.click && mk != null ? mk * x.conv / x.click : null),
    perday: e.total_purch ? x.conv * e.total_purch / 100 / 7 : null, est: !x.ours,
  }));
  if (!top.some((x) => x.ours) && e.purch_share != null) {
    out.push({ key: 'us', label: ourLabel, sub: 'outside the top 3', ours: true, pos: null, color: COL[0], click: e.click_share, purch: e.purch_share,
      cvr: e.our_clicks ? 100 * e.our_purch / e.our_clicks : null, perday: e.our_purch / 7, est: false });
  } else for (const r of out) if (r.ours) r.color = COL[0];
  return out;
}

// direct labels at each line's last point, pushed apart so they never sit on top of each other
function labels(series, x, y) {
  const L = series.map((s) => { const li = s.v.map((p, i) => (p != null ? i : -1)).filter((i) => i >= 0).pop(); return li == null ? null : { key: s.key, text: s.label.slice(0, 16), x: x(li) + 7, y: y(s.v[li]) + 3.5 }; }).filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < 12) L[i].y = L[i - 1].y + 12;
  return L;
}

function Chart({ t, weeks, ourLabel }) {
  const [hov, setHov] = useState(null);
  const latest = t.weeks[t.pos_week || t.latest] || {};
  // series: us (purchase share from SQP) and each ASIN in the newest top 3 (purchase share from Brand Analytics)
  const series = useMemo(() => {
    const S = [{ key: 'us', label: ourLabel, color: COL[0], v: weeks.map((w) => t.weeks[w]?.purch_share ?? null) }];
    (latest.top || []).slice(0, 3).forEach((x, i) => {
      if (x.ours) return;
      S.push({ key: x.asin, label: x.brand || short(x.name) || x.asin, color: COL[i + 1], v: weeks.map((w) => (t.weeks[w]?.top || []).find((y) => y.asin === x.asin)?.conv ?? null) });
    });
    return S;
  }, [t, weeks]);
  const W = 560, H = 170, L = 34, R = 100, T = 10, B = 24;
  const max = Math.max(5, ...series.flatMap((s) => s.v.filter((x) => x != null)));
  const yMax = Math.ceil(max / 10) * 10 || 10;
  const x = (i) => L + (weeks.length > 1 ? (i * (W - L - R)) / (weeks.length - 1) : (W - L - R) / 2);
  const y = (v) => T + (H - T - B) * (1 - v / yMax);
  const path = (v) => { let d = '', pen = false; v.forEach((p, i) => { if (p == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p).toFixed(1); pen = true; }); return d; };
  const ticks = [0, yMax / 2, yMax];
  const hv = hov != null ? series.map((s) => ({ ...s, val: s.v[hov] })).filter((s) => s.val != null) : null;
  return (
    <div className="t3chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Purchase share by week on "${t.term}": ${series.map((s) => s.label).join(', ')}`}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 6} y={y(v) + 3} textAnchor="end">{v}%</text></g>)}
        {weeks.map((w, i) => (i === 0 || i === weeks.length - 1 || weeks.length <= 5 || i % 2 === 0) && <text key={w} x={x(i)} y={H - 6} textAnchor="middle">{wk(w)}</text>)}
        {series.map((s) => <path key={s.key} d={path(s.v)} fill="none" stroke={s.color} strokeWidth={s.key === 'us' ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />)}
        {series.map((s) => s.v.map((p, i) => p != null && <circle key={s.key + i} cx={x(i)} cy={y(p)} r={hov === i ? 4.5 : 3} fill={s.color} stroke="var(--card)" strokeWidth="1.5" />))}
        {labels(series, x, y).map((l) => <text key={'l' + l.key} x={l.x} y={l.y} style={{ fill: 'var(--fg)', fontSize: 11 }}>{l.text}</text>)}
        {weeks.map((w, i) => <rect key={'h' + w} x={x(i) - (W - L - R) / Math.max(1, weeks.length - 1) / 2} y={0} width={(W - L - R) / Math.max(1, weeks.length - 1)} height={H} fill="transparent" onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />)}
      </svg>
      {hv && hv.length > 0 && <div className="t3tip">week of {wk(weeks[hov])}: {hv.map((s) => <span key={s.key}><i className="sw" style={{ background: s.color }} />{s.label} {pct(s.val)}</span>)}</div>}
      <div className="leg">{series.map((s) => <span key={s.key}><i className="sw" style={{ background: s.color }} />{s.label}</span>)}<span className="mut">purchase share of the search, by week</span></div>
    </div>
  );
}

function Term({ t, weeks, ourLabel }) {
  const e = t.weeks[t.latest] || {};
  const R = rows(t, t.latest, ourLabel);
  const us = R.find((r) => r.ours);
  const first = weeks.find((w) => t.weeks[w]?.purch_share != null);
  const delta = first && first !== t.latest && e.purch_share != null ? e.purch_share - t.weeks[first].purch_share : null;
  const pos = t.pos ? `#${t.pos} of the top 3` : 'outside the top 3';
  const need = t.need || {};
  const nextUp = t.pos ? (t.pos > 1 ? need['p' + (t.pos - 1)] : null) : (need.p3 ?? need.p2 ?? need.p1);
  const nextLabel = t.pos ? (t.pos > 1 ? `#${t.pos - 1}` : null) : (need.p3 != null ? '#3' : need.p2 != null ? '#2' : '#1');
  return (
    <div className="card t3">
      <div className="t3hd">
        <b style={{ fontSize: 17 }}>{t.term}</b>
        <span className="pill">{t.src === 'owns' ? 'owned keyword' : t.src === 'list' ? 'tracked' : 'top search for us'}</span>
        <span className="pos" style={{ background: t.pos === 1 ? COL[0] : t.pos ? COL[1] : COL[3] }}>{pos}{t.pos_week && t.pos_week !== t.latest ? ` · week of ${wk(t.pos_week)}` : ''}</span>
        <span className="mut small">our numbers: week of {wk(t.latest)} · {num(e.volume)} searches · {num(e.total_purch)} purchases ({num((e.total_purch || 0) / 7)}/day)</span>
      </div>
      <div className="t3grid">
        <Chart t={t} weeks={weeks} ourLabel={ourLabel} />
        <div>
          <div className="small mut" style={{ marginBottom: 4 }}>Sources: the top 3 from Brand Analytics (their share of every click and purchase on the search), our row from Search Query Performance. Neither is the ads console, which counts only paid clicks on our ads.</div>
          <table>
            <thead><tr><th>#</th><th className="nm">Who</th><th>Clicks</th><th>Purchases</th><th>CVR</th><th>Orders/day</th></tr></thead>
            <tbody>
              {R.map((r) => <tr key={r.key} className={r.ours ? 'us' : ''}>
                <td>{r.pos ? <span className="rk" style={{ background: r.color }}>{r.pos}</span> : <span className="mut">4+</span>}</td>
                <td className="nm"><i className="sw" style={{ background: r.color }} /><b>{r.label}</b><div className="mut small">{r.sub}</div></td>
                <td>{pct(r.click)}</td><td>{pct(r.purch)}</td><td>{r.est ? '~' : ''}{pct(r.cvr, 0)}</td><td>{r.est ? '~' : ''}{r.perday == null ? '-' : r.perday.toFixed(0)}</td>
              </tr>)}
            </tbody>
          </table>
          <p className="small" style={{ marginTop: 8 }}>
            {us && delta != null && <>Our purchase share {delta >= 0 ? 'up' : 'down'} <b>{Math.abs(delta).toFixed(1)} pts</b> since {wk(first)}. </>}
            {nextUp != null && nextLabel && (nextUp > 0 ? <>About <b>{nextUp.toFixed(0)} more orders a day</b> from this search to pass {nextLabel}.</> : <>Level with {nextLabel} on purchases.</>)}
            {t.pos === 1 && <>We hold the top spot{need.p2 != null ? '' : ''}.</>}
          </p>
          <p className="small mut">Competitor CVR and orders/day are estimates from click and purchase share; our numbers are exact.</p>
        </div>
      </div>
    </div>
  );
}

export default function Top3() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('top3').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load'))); }, []);
  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  const M = d.model;
  if (!M || !M.terms?.length) return <div className="card"><b>No top-3 data yet.</b> The engine builds it weekly from Brand Analytics (<code>adsops/ac_top3.py</code>) after the first full run with this step.</div>;
  const terms = [...M.terms].sort((a, b) => (a.src === 'owns' ? 0 : 1) - (b.src === 'owns' ? 0 : 1) || (b.weeks[b.latest]?.volume || 0) - (a.weeks[a.latest]?.volume || 0));
  const inside = terms.filter((t) => t.pos).length;
  const top1 = terms.filter((t) => t.pos === 1).length;
  const ourLabel = 'Us';
  return (
    <>
      <div className="card t3sum"><span>Searches tracked <b>{terms.length}</b></span><span>In the top 3 <b>{inside}</b></span><span>Holding #1 <b>{top1}</b></span>
        <span className="mut">weeks {wk(M.weeks[0])} to {wk(M.weeks[M.weeks.length - 1])} · built {M.built_at?.replace('T', ' ')}</span></div>
      {terms.map((t) => <Term key={t.term} t={t} weeks={M.weeks} ourLabel={ourLabel} />)}
      <p className="small mut">Top 3 = the three ASINs with the most clicks on the search (Amazon Brand Analytics, weekly). Purchase share is that ASIN's share of every purchase made from the search. Our line comes from Search Query Performance for the family's ASINs together. Tracked searches: the keywords our campaigns own plus the searches that bring us the most purchases; <code>intel/&lt;family&gt;/top3_terms.txt</code> overrides the list.</p>
    </>
  );
}
