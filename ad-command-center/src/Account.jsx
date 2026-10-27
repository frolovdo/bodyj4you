import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './App.jsx';
import { Move } from './Update.jsx';

// "Whole account" in the family menu: account KPIs with 90-day sparklines, the advertising profitability chart
// (every family ASIN: profit margin against ad % of sales, dot size = revenue), the daily ads brief with a button
// into each campaign's own Update page, then one line per family. Data: _system/account_model (ac_account_viz.py)
// and the same datasets the family pages use.
const money = (v, d = 0) => (v == null || isNaN(v) ? '-' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const k$ = (v) => (v == null || isNaN(v) ? '-' : Math.abs(v) >= 10000 ? '$' + (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'K' : money(v));
const pct = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(d) + '%');
const TONE = { bad: ['Act', 'bad'], info: ['Watch', 'mut'], good: ['Good', 'good'] };
const PT = (iso, o = {}) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit', ...o }) : '');
const Q = {
  protect: { name: 'Protect', sub: 'high margin · low ad %', color: 'var(--q-protect)' },
  maintain: { name: 'Maintain', sub: 'high margin · high ad %', color: 'var(--q-maintain)' },
  evaluate: { name: 'Evaluate', sub: 'low margin · low ad %', color: 'var(--q-evaluate)' },
  investigate: { name: 'Investigate', sub: 'low margin · high ad %', color: 'var(--q-investigate)' },
};
const quadrant = (margin, adpct, mT, aT) => (margin >= mT ? (adpct < aT ? 'protect' : 'maintain') : (adpct < aT ? 'evaluate' : 'investigate'));
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Switch the whole app to a family and open its Update page, scrolled to one campaign when given.
export const go = (fam, cid) => { try { localStorage.setItem('ac_family', fam); } catch {} location.hash = '#/update' + (cid ? '?focus=' + cid : ''); location.reload(); };

// ---------------------------------------------------------------- KPI tiles
function Delta({ now, ref_, label, up }) {
  if (now == null || ref_ == null || !ref_) return <span>{label} -</span>;
  const d = 100 * (now - ref_) / Math.abs(ref_);
  const flat = Math.abs(d) < 5;
  const good = up ? d > 0 : d < 0;
  return <span className={flat ? 'mut' : good ? 'good' : 'bad'}>{label} {d > 0 ? '+' : ''}{d.toFixed(0)}%</span>;
}

function Spark({ days, vals, fmt }) {
  const [hov, setHov] = useState(null);
  const W = 200, H = 36, p = 3;
  const pts = vals.map((v, i) => [i, v]).filter((x) => x[1] != null);
  if (pts.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} />;
  const lo = Math.min(...pts.map((x) => x[1])), hi = Math.max(...pts.map((x) => x[1]));
  const X = (i) => p + (i / (vals.length - 1)) * (W - 2 * p), Y = (v) => (hi === lo ? H / 2 : p + (1 - (v - lo) / (hi - lo)) * (H - 2 * p));
  const m = mean(vals);
  const d = pts.map(([i, v], j) => (j ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (vals.length - 1)); setHov(Math.max(0, Math.min(vals.length - 1, i))); };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHov(null)} role="img" aria-label="last 90 days">
      {m != null && <line x1={p} x2={W - p} y1={Y(m)} y2={Y(m)} stroke="var(--bd)" strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {hov != null && vals[hov] != null && <>
        <line x1={X(hov)} x2={X(hov)} y1={0} y2={H} stroke="var(--mut)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx={X(hov)} cy={Y(vals[hov])} r="3" fill="var(--accent)" stroke="var(--card)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <title>{days[hov]}: {fmt(vals[hov])}</title>
      </>}
    </svg>
  );
}

function Kpis({ s }) {
  const n = s.days.length;
  const slice = (a, from, to) => a.slice(Math.max(0, n - from), n - to);
  const ratio = (a, b) => s.days.map((_, i) => (a[i] != null && b[i] ? 100 * a[i] / b[i] : null));
  const tacos = ratio(s.spend, s.sales), acos = ratio(s.spend, s.ad_sales);
  const tiles = [
    { key: 'spend', lbl: 'Ad spend / day', vals: s.spend, fmt: (v) => money(v), up: null },
    { key: 'ad_sales', lbl: 'Ad sales / day', vals: s.ad_sales, fmt: (v) => money(v), up: true },
    { key: 'sales', lbl: 'Total sales / day', vals: s.sales, fmt: (v) => money(v), up: true },
    { key: 'tacos', lbl: 'TACoS', vals: tacos, fmt: (v) => pct(v, 1), up: false },
    { key: 'acos', lbl: 'ACoS', vals: acos, fmt: (v) => pct(v, 1), up: false },
    { key: 'ad_orders', lbl: 'Ad orders / day', vals: s.ad_orders, fmt: (v) => Number(v).toFixed(0), up: true },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => {
        const v7 = mean(slice(t.vals, 7, 0)), p7 = mean(slice(t.vals, 14, 7)), m30 = mean(slice(t.vals, 30, 0));
        return (
          <div className="kpi" key={t.key}>
            <div className="tl">{t.lbl}</div>
            <div className="v">{v7 == null ? '-' : t.fmt(v7)}</div>
            <div className="d">
              {t.up == null ? <span>W/W {v7 != null && p7 ? ((100 * (v7 - p7) / p7) > 0 ? '+' : '') + (100 * (v7 - p7) / p7).toFixed(0) + '%' : '-'}</span> : <Delta now={v7} ref_={p7} label="W/W" up={t.up} />}
              {t.up == null ? <span>vs 30d {v7 != null && m30 ? ((100 * (v7 - m30) / m30) > 0 ? '+' : '') + (100 * (v7 - m30) / m30).toFixed(0) + '%' : '-'}</span> : <Delta now={v7} ref_={m30} label="vs 30d" up={t.up} />}
            </div>
            <Spark days={s.days} vals={t.vals} fmt={t.fmt} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- profitability chart
function rowsFor(model, mode, direct, labels) {
  const asins = model.asins.filter((a) => a.rev > 0);
  const item = (key, name, fam, parts) => {
    const rev = sum(parts.map((p) => p.rev));
    const withCost = parts.filter((p) => p.profit != null);
    const ad = sum(parts.map((p) => (direct ? p.sp_spend : p.sp_spend + p.sb_spend)));
    const revC = sum(withCost.map((p) => p.rev));
    // direct-only: add the SB share back into profit (profit in the model is after all allocated spend)
    const profit = withCost.length ? sum(withCost.map((p) => p.profit + (direct ? p.sb_spend : 0))) : null;
    const trend = [0, 1, 2].map((w) => {
      const tp = parts.map((p) => p.trend[w]).filter(Boolean);
      const r = sum(tp.map((t) => t.rev)), a = sum(tp.map((t) => (direct ? t.sp : t.ad)));
      const pr = tp.filter((t) => t.profit != null);
      const pf = pr.length ? sum(pr.map((t) => t.profit + (direct ? (t.ad - t.sp) : 0))) : null;
      return { w, rev: r, ad: a, profit: pf };
    });
    return {
      key, name, fam, label: labels[fam] || fam, parts: parts.length, rev, units: sum(parts.map((p) => p.units)), sess: sum(parts.map((p) => p.sess)),
      ad, sp: sum(parts.map((p) => p.sp_spend)), sb: sum(parts.map((p) => p.sb_spend)), sp_sales: sum(parts.map((p) => p.sp_sales)), sp_orders: sum(parts.map((p) => p.sp_orders)),
      profit, margin: profit != null && revC ? 100 * profit / revC : null, adpct: rev ? 100 * ad / rev : null, tpoas: profit != null && ad ? profit / ad : null,
      noCost: parts.length - withCost.length, price: parts.length === 1 ? parts[0].price : null, cogs: parts.length === 1 ? parts[0].cogs : null, fees: parts.length === 1 ? parts[0].fees : null,
      size: parts.length === 1 ? parts[0].size : '', asin: parts.length === 1 ? parts[0].asin : '', trend,
    };
  };
  if (mode === 'family') {
    const by = {};
    for (const a of asins) (by[a.fam] = by[a.fam] || []).push(a);
    return Object.entries(by).map(([f, parts]) => item(f, labels[f] || f, f, parts));
  }
  return asins.map((a) => item(a.asin, a.sku || a.asin, a.fam, [a]));
}

function Bubble({ rows, mT, aT, sel, setSel }) {
  const [tip, setTip] = useState(null);
  const box = useRef(null);
  const W = 760, H = 430, L = 46, R = 14, T = 18, B = 40;
  const plotted = rows.filter((r) => r.margin != null && r.adpct != null);
  const xs = plotted.map((r) => r.adpct).sort((a, b) => a - b), ys = plotted.map((r) => r.margin).sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))] : 0);
  const xMax = Math.min(100, Math.max(2 * aT, Math.ceil(q(xs, 0.95) / 5) * 5 + 5));
  const yMin = Math.max(-50, Math.min(-5, Math.floor(q(ys, 0.05) / 5) * 5)), yMax = Math.min(100, Math.max(mT + 20, Math.ceil(q(ys, 0.97) / 5) * 5 + 5));
  const inside = plotted.filter((r) => r.adpct <= xMax && r.margin >= yMin && r.margin <= yMax);
  const off = plotted.length - inside.length;
  const X = (v) => L + (v / xMax) * (W - L - R), Y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const maxRev = Math.max(1, ...inside.map((r) => r.rev));
  const rad = (rev) => 4 + 22 * Math.sqrt(rev / maxRev);
  const xT = X(Math.min(aT, xMax)), yT = Y(Math.max(yMin, Math.min(yMax, mT)));
  const ticksX = [], ticksY = [];
  for (let v = 0; v <= xMax; v += xMax > 50 ? 20 : xMax > 25 ? 10 : 5) ticksX.push(v);
  for (let v = Math.ceil(yMin / 10) * 10; v <= yMax; v += 10) ticksY.push(v);
  const byRev = [...inside].sort((a, b) => b.rev - a.rev);   // big dots first, small ones stay clickable on top
  const show = (e, r) => { const b = box.current?.getBoundingClientRect(); if (!b) return; setTip({ x: e.clientX - b.left + 12, y: e.clientY - b.top + 12, r }); };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg className="plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit margin against ad % of sales, one dot per product">
        <rect x={L} y={T} width={xT - L} height={yT - T} fill="var(--q-protect)" opacity=".07" />
        <rect x={xT} y={T} width={W - R - xT} height={yT - T} fill="var(--q-maintain)" opacity=".07" />
        <rect x={L} y={yT} width={xT - L} height={H - B - yT} fill="var(--q-evaluate)" opacity=".07" />
        <rect x={xT} y={yT} width={W - R - xT} height={H - B - yT} fill="var(--q-investigate)" opacity=".07" />
        {ticksY.map((v) => <g key={'y' + v}><line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text className="ax" x={L - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
        {ticksX.map((v) => <text key={'x' + v} className="ax" x={X(v)} y={H - B + 16} textAnchor="middle">{v}%</text>)}
        <line x1={xT} x2={xT} y1={T} y2={H - B} stroke="var(--mut)" strokeDasharray="4 4" />
        <line x1={L} x2={W - R} y1={yT} y2={yT} stroke="var(--mut)" strokeDasharray="4 4" />
        <text className="qlab" x={L + 6} y={T + 14} fill="var(--q-protect)">Protect · high margin, low ad %</text>
        <text className="qlab" x={W - R - 6} y={T + 14} textAnchor="end" fill="var(--q-maintain)">Maintain · high margin, high ad %</text>
        <text className="qlab" x={L + 6} y={H - B - 6} fill="var(--q-evaluate)">Evaluate · low margin, low ad %</text>
        <text className="qlab" x={W - R - 6} y={H - B - 6} textAnchor="end" fill="var(--q-investigate)">Investigate · low margin, high ad %</text>
        <text className="ax" x={W - R} y={H - 4} textAnchor="end">Ad % of sales (ad spend ÷ revenue, 30 days) →</text>
        <text className="ax" transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">Profit margin % ↑</text>
        {byRev.map((r) => {
          const qd = quadrant(r.margin, r.adpct, mT, aT);
          return <circle key={r.key} className={'dot' + (sel && sel.key === r.key ? ' sel' : sel ? ' dim' : '')} cx={X(r.adpct)} cy={Y(r.margin)} r={rad(r.rev)} fill={Q[qd].color} fillOpacity=".85"
            onMouseMove={(e) => show(e, r)} onMouseLeave={() => setTip(null)} onClick={() => setSel(sel && sel.key === r.key ? null : r)}>
            <title>{r.name}: margin {pct(r.margin)}, ad {pct(r.adpct, 1)} of sales, revenue {k$(r.rev)}</title></circle>;
        })}
      </svg>
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}><b>{tip.r.name}</b>{tip.r.asin ? ` · ${tip.r.label}` : ` · ${tip.r.parts} ASINs`}<br />margin {pct(tip.r.margin)} · ad {pct(tip.r.adpct, 1)} of sales · {k$(tip.r.rev)} revenue</div>}
      {off > 0 && <div className="small mut" style={{ position: 'absolute', right: 8, top: 4 }}>{off} off-scale</div>}
    </div>
  );
}

function Panel({ r, mT, aT }) {
  if (!r) return <div className="panel"><p className="mut small" style={{ margin: 0 }}>Click a dot: its numbers, ad type mix and the trend over three 30-day windows.</p></div>;
  const qd = quadrant(r.margin, r.adpct, mT, aT);
  const t = r.trend, maxAd = Math.max(1, ...t.map((x) => x.ad));
  const tp = (x) => (x.profit != null && x.ad ? (x.profit / x.ad).toFixed(1) + '×' : '-');
  const cvr = r.sess ? 100 * r.units / r.sess : null;
  return (
    <div className="panel">
      <span className="pill" style={{ background: Q[qd].color, color: '#fff' }}><b>{Q[qd].name}</b></span>
      <div className="big" style={{ marginTop: 6 }}>{r.name}</div>
      <div className="small mut">{r.asin ? `${r.label} · ${r.asin}` : `${r.fam} · ${r.parts} ASINs`}{r.size ? ` · ${r.size}` : ''}</div>
      <div className="kv">
        <div><b>{k$(r.rev)}</b><span className="small mut">Revenue, 30 days</span></div>
        <div><b>{pct(r.margin)}</b><span className="small mut">Profit margin{r.noCost ? ` (${r.noCost} without COGS left out)` : ''}</span></div>
        <div><b>{pct(r.adpct, 1)}</b><span className="small mut">Ad % of sales</span></div>
        <div><b>{r.tpoas != null ? r.tpoas.toFixed(1) + '×' : '-'}</b><span className="small mut">Profit per $1 of ads</span></div>
        <div><b>{k$(r.profit)}</b><span className="small mut">Profit after ads</span></div>
        <div><b>{cvr != null ? pct(cvr, 1) : '-'}</b><span className="small mut">Units per session</span></div>
        {r.price != null && <div><b>{money(r.price, 2)}</b><span className="small mut">Avg price · COGS {money(r.cogs, 2)} · fees {money(r.fees, 2)}</span></div>}
        <div><b>{money(r.sp_sales)}</b><span className="small mut">SP ad sales · {r.sp_orders} ad orders</span></div>
      </div>
      <div className="tl">Ad type mix</div>
      <div className="mix"><i style={{ width: pct(r.ad ? 100 * r.sp / r.ad : 100), background: 'var(--c2)' }} /><i style={{ width: pct(r.ad ? 100 * r.sb / r.ad : 0), background: 'var(--c3)' }} /></div>
      <div className="small mut">Sponsored Products {money(r.sp)} · Sponsored Brands {money(r.sb)}{r.sb ? ' (allocated by revenue share)' : ''}</div>
      <div className="tl" style={{ marginTop: 10 }}>Ad spend and profit per $1 of ads, three 30-day windows</div>
      <div className="tbar">{[2, 1, 0].map((w) => <div key={w} style={{ height: pct(100 * t[w].ad / maxAd), background: w === 0 ? 'var(--accent)' : 'var(--bd)' }}><span>{tp(t[w])}</span></div>)}</div>
      <div className="small mut" style={{ display: 'flex', justifyContent: 'space-between' }}><span>60-90 days ago</span><span>30-60</span><span>last 30 · {money(t[0].ad)}</span></div>
      <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => go(r.fam)}>Open {r.label} campaigns →</button>
    </div>
  );
}

function Profitability({ model, labels }) {
  const [mode, setMode] = useState(() => lsGet('ac_viz_mode', 'asin'));
  const [direct, setDirect] = useState(() => lsGet('ac_viz_direct', false));
  const [mT, setMT] = useState(() => lsGet('ac_viz_mT', 20));
  const [aT, setAT] = useState(() => lsGet('ac_viz_aT', 25));
  const [sel, setSel] = useState(null);
  const [table, setTable] = useState(false);
  useEffect(() => { lsSet('ac_viz_mode', mode); lsSet('ac_viz_direct', direct); lsSet('ac_viz_mT', mT); lsSet('ac_viz_aT', aT); }, [mode, direct, mT, aT]);
  const rows = useMemo(() => rowsFor(model, mode, direct, labels), [model, mode, direct, labels]);
  useEffect(() => { setSel(null); }, [mode, direct]);
  const plotted = rows.filter((r) => r.margin != null && r.adpct != null);
  const tot = {};
  for (const r of plotted) { const qd = quadrant(r.margin, r.adpct, mT, aT); tot[qd] = tot[qd] || { rev: 0, n: 0 }; tot[qd].rev += r.rev; tot[qd].n += 1; }
  const noCost = rows.filter((r) => r.margin == null);
  const sorted = [...plotted].sort((a, b) => b.rev - a.rev);
  return (
    <div className="card">
      <div className="ctl">
        <span className="seg"><button type="button" className={!direct ? 'on' : ''} onClick={() => setDirect(false)}>All spend, allocated</button><button type="button" className={direct ? 'on' : ''} onClick={() => setDirect(true)}>Direct only (SP)</button></span>
        <span className="seg"><button type="button" className={mode === 'asin' ? 'on' : ''} onClick={() => setMode('asin')}>By ASIN</button><button type="button" className={mode === 'family' ? 'on' : ''} onClick={() => setMode('family')}>By family</button></span>
        <label>Margin line <input type="number" value={mT} min={-50} max={90} onChange={(e) => setMT(Number(e.target.value))} />%</label>
        <label>Ad % line <input type="number" value={aT} min={1} max={100} onChange={(e) => setAT(Number(e.target.value))} />%</label>
        <span className="small mut">{model.start} to {model.end} · dot size = revenue · {plotted.length} {mode === 'asin' ? 'ASINs' : 'families'} with sales{noCost.length ? ` · ${noCost.length} without COGS not drawn` : ''}</span>
      </div>
      <div className="viz">
        <Bubble rows={rows} mT={mT} aT={aT} sel={sel} setSel={setSel} />
        <Panel r={sel} mT={mT} aT={aT} />
      </div>
      <div className="legend">
        {Object.entries(Q).map(([k, q]) => <span key={k}><i className="sw" style={{ background: q.color }} />{q.name} <b>{k$(tot[k]?.rev || 0)}</b> <span className="mut">({tot[k]?.n || 0})</span></span>)}
        <span className="mut small">Profit = revenue − units × (COGS + Amazon fees) − ad spend. Sponsored Brands spread over the family's ASINs by revenue share.</span>
      </div>
      <details onToggle={(e) => setTable(e.target.open)}><summary>Table of every dot</summary>
        {table && <div className="wrap"><table className="kw"><thead><tr><th>{mode === 'asin' ? 'SKU' : 'Family'}</th><th>Family</th><th>Revenue</th><th>Ad spend</th><th>Ad %</th><th>Margin</th><th>Profit / $1 ads</th><th>Quadrant</th></tr></thead>
          <tbody>{sorted.map((r) => { const qd = quadrant(r.margin, r.adpct, mT, aT); return <tr key={r.key} style={{ cursor: 'pointer' }} onClick={() => setSel(r)}><td><b>{r.name}</b></td><td>{r.label}</td><td>{money(r.rev)}</td><td>{money(r.ad)}</td><td>{pct(r.adpct, 1)}</td><td>{pct(r.margin)}</td><td>{r.tpoas != null ? r.tpoas.toFixed(1) + '×' : '-'}</td><td><i className="sw" style={{ background: Q[qd].color }} />{Q[qd].name}</td></tr>; })}
          {noCost.map((r) => <tr key={r.key}><td><b>{r.name}</b></td><td>{r.label}</td><td>{money(r.rev)}</td><td>{money(r.ad)}</td><td>{pct(r.adpct, 1)}</td><td className="mut" colSpan={3}>no COGS in family.json</td></tr>)}</tbody></table></div>}
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- brief
function Item({ it }) {
  const [tag, cls] = TONE[it.tone] || TONE.info;
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div><span className={'pill ' + cls}><b>{tag}</b></span> <b>{it.head}</b></div>
      {it.why?.length > 0 && <ul className="small" style={{ margin: '6px 0 0 18px', padding: 0 }}>{it.why.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {it.do && <div className="small" style={{ marginTop: 6 }}><b>→ {it.do}</b></div>}
      {it.targets?.length > 0 && (
        <div className="hz" style={{ marginTop: 8, gap: 6 }}>
          {it.targets.map((t, i) => (
            <button key={i} type="button" className="btn ghost sm" style={{ flex: '0 0 auto' }} onClick={() => go(t.fam, t.cid)}>
              Open {t.name ? t.name.replace(' - AI', '') : t.fam}{t.name ? ` · ${t.fam}` : ''} →
            </button>))}
        </div>)}
    </div>
  );
}

export default function Account() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('account').then((r) => { if (r.ok) setD(r); else setError(r.error || 'could not load'); }); }, []);
  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading the account…</p>;
  const b = d.brief, m = d.model;
  const labels = Object.fromEntries((d.families || []).map((f) => [f.family, f.parent_sku || f.label || f.family]));
  const fmt = (k, v) => (k === 'ord_d' ? Number(v).toFixed(0) : k === 'cpc' ? money(v, 2) : k === 'acos' ? money(v) : pct(v));
  const Cell = ({ five, k }) => {
    const t = (five || []).find((x) => x.key === k);
    if (!t || t.v7 == null) return <td className="mut">-</td>;
    return <td><b>{fmt(k, t.v7)}</b> {t.v30 != null && <span className="small"><Move now={t.v7} ref_={t.v30} up={t.up} /></span>}</td>;
  };
  return (
    <>
      <h2 style={{ margin: '4px 0 8px' }}>Whole account · last 7 days, the move against the week before and the 30-day average, 90 days drawn</h2>
      {m?.series ? <Kpis s={m.series} /> : <div className="card"><p className="mut">No account model yet. The engine builds it every morning after the 04:30 PT run.</p></div>}

      <h2 style={{ margin: '14px 0 8px' }}>Advertising profitability, last 30 days</h2>
      {m?.asins ? <Profitability model={m} labels={labels} /> : null}

      <h2 style={{ margin: '18px 0 8px' }}>Daily ads brief, all families</h2>
      {!b ? <div className="card"><p className="mut">No brief yet. The engine builds it every morning after the 04:30 PT run.</p></div> : (
        <>
          <p className="mut small" style={{ margin: '0 0 8px' }}>
            {b.date} · built {PT(b.built_at)} Pacific · changes {PT(b.since, { weekday: undefined })} to {PT(b.through, { weekday: undefined })} · Amazon ad data through {b.data_through || 'n/a'}
            {b.emailed_at ? ' · emailed' : ' · not emailed yet'}. Each button opens that campaign on its family's Update page; nothing changes until you review and send there.
          </p>
          {b.top.length === 0 && <div className="card"><p>Nothing important: no big budget or placement changes, no profitable campaign stopping early, no big swing in sales or ACoS.</p></div>}
          {b.top.map((it, i) => <Item key={i} it={it} />)}
          {b.more.length > 0 && (
            <div className="card">
              <div className="lbl">Smaller findings</div>
              {b.more.map((it, i) => (
                <div key={i} className="small" style={{ margin: '4px 0' }}>
                  · {it.head}{it.targets?.length > 0 && <> {it.targets.slice(0, 2).map((t, j) => <a key={j} href="#" style={{ marginLeft: 6 }} onClick={(e) => { e.preventDefault(); go(t.fam, t.cid); }}>open {t.name ? t.name.replace(' - AI', '') : t.fam} →</a>)}</>}
                </div>))}
            </div>)}
          {b.other && <p className="mut small">Checked and left out: {b.other.minor || 0} small budget or boost changes, {b.other.hand || 0} smaller changes by hand in Amazon, {b.other.ours || 0} sent through our tools, {b.other.daypart || 0} hourly bid moves.</p>}
        </>)}

      <h2 style={{ margin: '18px 0 4px' }}>Families</h2>
      <p className="mut small" style={{ margin: '0 0 8px' }}>Last 7 days and the move against the 30-day average (under 5% is flat). A campaign shared by two families counts in both lines. Click a row's button to work on that family.</p>
      <div className="card" style={{ padding: '6px 10px' }}>
        <div className="wrap" style={{ overflowX: 'auto' }}>
          <table className="kw"><thead><tr><th>Family</th><th>Ad orders / day</th><th>Ad cost per $100</th><th>TACoS</th><th>Spend / day</th><th>Budget used</th><th>Campaigns on</th><th>Suggestions</th><th></th></tr></thead>
            <tbody>{d.families.map((f) => (
              <tr key={f.family}>
                <td><b>{f.parent_sku}</b><div className="small mut">{f.label}{f.rank ? ` · #${f.rank}` : ''}{f.sales_30d != null ? ` · ${money(f.sales_30d)} / 30d` : ''}</div></td>
                <Cell five={f.five} k="ord_d" /><Cell five={f.five} k="acos" /><Cell five={f.five} k="tacos" />
                <td>{f.spent7 != null ? <b>{money(f.spent7)}</b> : '-'}{f.tbud != null ? <span className="small mut"> of {money(f.tbud)}</span> : null}</td>
                <Cell five={f.five} k="used" />
                <td>{f.enabled || '-'}</td>
                <td>{f.suggestions ? <>{f.suggestions}{f.decide ? <span className="small mut"> ({f.decide} to decide)</span> : null}</> : <span className="mut">-</span>}</td>
                <td><button type="button" className="btn ghost sm" onClick={() => go(f.family)}>Open →</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
