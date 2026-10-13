import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';
import Popup from './Popup.jsx';

const BLOCKS = [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hname = (h) => (h === 0 || h === 24 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h}am` : `${h - 12}pm`);
const money = (v) => (v == null || isNaN(v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)));

function Grid({ x, be, tgt }) {
  const tot = x.hr_cost.reduce((a, b) => a + b, 0) || 1, big = Math.max(...x.hr_cost) || 1;
  const col = (K) => (K.clk < 20 ? 'var(--card)' : K.acos == null ? 'var(--surface)' : K.acos <= tgt ? 'color-mix(in srgb,var(--good) 35%,var(--card))' : K.acos <= be ? 'color-mix(in srgb,var(--warn) 35%,var(--card))' : 'color-mix(in srgb,var(--bad) 40%,var(--card))');
  return (
    <div className="wrap"><table className="dp"><tbody>
      <tr><th></th>{Array.from({ length: 24 }, (_, h) => <th key={h}>{h % 3 === 0 ? h : ''}</th>)}</tr>
      <tr><th className="hl">Spend share</th>{x.hr_cost.map((v, h) => <td key={h} style={{ background: `color-mix(in srgb,var(--accent) ${Math.min(50, Math.round((50 * v) / big))}%,var(--card))` }} title={money(v)}>{v / tot >= 0.015 ? Math.round((100 * v) / tot) : ''}</td>)}</tr>
      <tr><th className="hl">Ad cost per $100</th>{x.blk.map((K, i) => <td key={i} colSpan={3} style={{ background: col(K) }} title={`${K.clk} clicks`}>{K.clk < 20 ? '' : K.acos == null ? '-' : Math.round(K.acos)}</td>)}</tr>
      <tr><th className="hl">Proposed bid</th>{Array.from({ length: 24 }, (_, h) => { const m = x.hours[String(h)] ?? 1; return <td key={h} style={{ background: m < 1 ? 'color-mix(in srgb,var(--bad) 30%,var(--card))' : m > 1 ? 'color-mix(in srgb,var(--good) 30%,var(--card))' : 'var(--card)' }}>{m !== 1 && h % 3 === 1 ? `${m > 1 ? '+' : ''}${Math.round(100 * (m - 1))}%` : ''}</td>; })}</tr>
    </tbody></table></div>
  );
}

export default function Hourly({ csrf }) {
  const [d, setD] = useState(null); const [error, setError] = useState('');
  const [tick, setTick] = useState({}); const [boxes, setBoxes] = useState({});
  const [pop, setPop] = useState(null); const [preview, setPreview] = useState(null); const [result, setResult] = useState(null); const [msg, setMsg] = useState('');
  const load = () => api('hourly').then((r) => { if (r.ok) { setD(r); setTick(Object.fromEntries((r.model?.campaigns || []).filter((c) => c.changed).map((c) => [c.id, true]))); } else setError(r.error || 'could not load'); });
  useEffect(() => { load(); }, []);
  const post = (b) => api('hourly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf, ...b }) });
  const form = () => { const f = {}; for (const [cid, on] of Object.entries(tick)) if (on) f['dp_' + cid] = '1'; for (const [k, v] of Object.entries(boxes)) f[k] = v; return f; };
  const review = async () => { setPop({ title: 'Apply this hourly bid schedule?', label: 'Yes, apply it' }); setPreview(null); setResult(null); setPreview(await post({ do: 'preview', ...form() })); };
  const confirm = async () => { const r = await post({ do: 'enable', ...form() }); setResult({ ok: !!r.ok, text: r.ok ? r.msg : r.error }); load(); };
  const off = async () => { setMsg('Restoring base bids…'); const r = await post({ do: 'disable' }); setMsg(r.ok ? r.msg : r.error); load(); };
  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  const M = d.model;
  if (!M) return <div className="card">No hourly model yet.</div>;
  const S = d.schedule;
  const totDc = M.campaigns.reduce((s, x) => s + (x.d_cost || 0), 0), totDo = M.campaigns.reduce((s, x) => s + (x.d_ord || 0), 0);
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Hours and days: when your ads earn and when they waste</h2>
      <p className="mut small">Every hour from {M.start} to {M.end}, account time. Shading on the spend row is each campaign against its own busiest hour; the ad-cost row is green at or under your target (${Math.round(M.tgt)} per $100), amber up to break-even (${Math.round(M.be)}), red above it. Blocks with fewer than {M.min_clicks} clicks are left alone: too little to judge.</p>
      {msg && <div className="card"><b>{msg}</b></div>}
      {S?.enabled && <div className="card" style={{ borderLeft: '4px solid var(--good)' }}><b>Schedule is ON</b> since {(S.at || '').slice(0, 16).replace('T', ' ')} UTC ({S.by_user}). Bids move every hour at :02 from their stored base. Last run: {S.last_run_note || 'not yet'}. <button className="btn alt sm" onClick={off}>Switch off and restore base bids</button></div>}
      <div className="card plain"><h3 style={{ margin: '0 0 6px' }}>In plain words</h3><ul>
        <li>Nothing is switched off. Weak hours get a <b>smaller bid</b> ({Math.round(100 * (1 - M.dim))}% less, 15% less on rank campaigns), strong hours a <b>bigger one</b> ({Math.round(100 * (M.boost - 1))}% more). Switching hours off would also switch off the rank signal Amazon reads from them.</li>
        <li>Across all campaigns the schedule is expected to change spend by <b>{totDc >= 0 ? '+' : ''}{money(totDc)} a day</b> and ad orders by <b>{totDo >= 0 ? '+' : ''}{totDo.toFixed(1)} a day</b>, using each campaign's measured click response. Estimates; the first two weeks are the test.</li></ul></div>
      {M.campaigns.map((x) => (
        <div className="card" key={x.id}>
          <div className="chead"><h3 style={{ margin: 0 }}>{x.name}</h3><span className="pill">{Math.round(x.clicks).toLocaleString()} clicks, {x.days} days</span></div>
          <Grid x={x} be={M.be} tgt={M.tgt} />
          <h4 className="sh">Our reading</h4>
          <ul className="rs small">{x.reasons.length ? x.reasons.map((r, i) => <li key={i} className={r.kind.split('_')[0]}>{r.text}</li>) : <li className="mut">No hour or day stands out enough to change. The honest reading is: run it flat.</li>}
            {x.uncertain?.length > 0 && <li className="mut">Uncertain (under {M.min_clicks} clicks, no call made): {x.uncertain.join(', ')}.</li>}</ul>
          <p className="small">If applied as read: spend <b>{x.d_cost >= 0 ? '+' : ''}{money(x.d_cost)}/day</b>, orders <b>{x.d_ord >= 0 ? '+' : ''}{x.d_ord.toFixed(1)}/day</b>, using this campaign's measured click response ({x.el >= 0 ? '+' : ''}{Math.round(100 * x.el)}% clicks per 1% of bid, cost follows {Math.round(100 * x.pt)}%). An estimate, not a promise.</p>
          <details><summary className="small">Your timing: % change to the bid, by 3-hour block and by weekday (0 = no change)</summary>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>{BLOCKS.map(([a], i) => <label key={i} className="small" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{hname(a)}<input style={{ width: 56, textAlign: 'center', minHeight: 36 }} value={boxes[`hb_${x.id}_${i}`] ?? Math.round(100 * ((x.hours[String(a)] ?? 1) - 1))} onChange={(e) => setBoxes((b) => ({ ...b, [`hb_${x.id}_${i}`]: e.target.value }))} inputMode="numeric" /></label>)}</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{WD.map((w, i) => <label key={i} className="small" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{w}<input style={{ width: 52, textAlign: 'center', minHeight: 36 }} value={boxes[`hd_${x.id}_${i}`] ?? Math.round(100 * ((x.daysm[String(i)] ?? 1) - 1))} onChange={(e) => setBoxes((b) => ({ ...b, [`hd_${x.id}_${i}`]: e.target.value }))} inputMode="numeric" /></label>)}</div></details>
          <label style={{ marginTop: 8 }}><input type="checkbox" checked={!!tick[x.id]} onChange={(e) => setTick((t) => ({ ...t, [x.id]: e.target.checked }))} /> Include {x.name}</label>
        </div>))}
      <div className="bar"><span className="mut small">Nothing runs by itself. On confirm, the schedule is saved and the hourly job starts moving these bids from their stored base; switching it off puts every bid back.</span>
        <button type="button" className="btn cta" aria-disabled={!Object.values(tick).some(Boolean) || !d.can_send} onClick={review}>Review and apply this schedule</button></div>
      <Popup open={!!pop} title={pop?.title} label={pop?.label} preview={preview} progress={null} result={result} onConfirm={confirm} onClose={() => setPop(null)} />
    </>
  );
}
