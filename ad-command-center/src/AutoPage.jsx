import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// A family on auto-pilot: the daily robot (Mac, 9:20 Pacific) changes bids, targets, keywords and negatives on its own inside the
// owner's limits; the hourly Budget boost has its own page. This page shows what it did today and why, the 30-day read of every
// target, and the rules it follows. Data: dataset <family>/auto.
const money = (v) => (v == null ? '–' : '$' + (Math.abs(+v) >= 20 ? Math.round(+v) : (+v).toFixed(2)));
const num = (v) => (v == null ? '–' : (+v).toLocaleString());
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '–');
const SIG = { up: 'good', down: 'crit', pause: 'crit', negative: 'crit', harvest: 'good', watch: 'mut', wait: 'mut', hold: 'mut', warn: 'crit' };

const Line = ({ e }) => (
  <><span className={'bst-sig ' + (e.status === 'FAILED' ? 'crit' : SIG[e.kind] || 'mut')} /><b>{e.head}.</b> <span className="mut">{e.why}</span>
    {e.status && e.status !== 'OK' ? <span className={'pill st ' + (e.status === 'FAILED' ? 'bst-crit' : 'bst-mut')}>{e.status.toLowerCase()}</span> : null}</>
);

export default function AutoPage({ fam }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('auto').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load'))); }, []);
  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  const a = d.auto;
  if (!a) return <div className="card"><p className="mut">The auto-pilot has not run yet for {fam?.parent_sku}. It runs on the Mac daily at 9:20 Pacific (job "auto").</p></div>;
  const t = a.totals30 || {};
  const log = [...(a.log || [])].reverse();
  const days = [...new Set(log.map((e) => e.t.slice(0, 10)))];
  return (
    <div className="bst">
      <div className="card bst-top">
        <div className="bst-head">
          <div>
            <span className={'pill st ' + (a.mode === 'live' ? 'bst-live' : 'bst-shadow')}>{a.mode === 'live' ? 'AUTO-PILOT LIVE' : 'AUTO-PILOT SHADOW: decides, sends nothing'}</span>
            <span className="pill">goal ROAS {a.goal_roas}</span><span className="pill">cap {money(a.spend_cap_day)}/day</span>
          </div>
          <div className="small">Last run {a.as_of?.slice(0, 10)} {hhmm(a.as_of)} Pacific · next 9:20</div>
        </div>
        <p className="bst-rule">{a.rule}</p>
        <div className="kpis">
          <div className="kpi"><div className="tl mut small">Last 30 days</div><div className="v">{money(t.cost)} <span className="mut">→ {money(t.sales)}</span></div><div className="d"><span>{num(t.orders)} orders</span><span>ROAS {t.roas == null ? '–' : t.roas.toFixed(2)}</span><span>{num(t.clicks)} clicks</span></div></div>
          <div className="kpi"><div className="tl mut small">Base budgets today</div><div className="v">{money(a.budget_total)}</div><div className="d"><span>{(a.campaigns || []).map((c) => c.name.replace(/^FJ ?9804\s*\|?\s*/, '') + ' ' + money(c.budget)).join(' · ')}</span></div></div>
          <div className="kpi"><div className="tl mut small">Today</div><div className="v">{(a.changes || []).filter((c) => c.status === 'OK' || c.status === 'SHADOW').length} changes</div><div className="d"><span>{a.watch?.length || 0} targets watched</span><span>{a.terms?.harvest?.length || 0} terms to harvest</span></div></div>
        </div>
      </div>

      <div className="card">
        <h2 className="sec">What it did today</h2>
        {!(a.changes || []).length && <p className="mut">{a.nothing_reason || 'No change today.'}</p>}
        {(a.changes || []).map((c, i) => <p key={i} className="bst-why"><Line e={c} /></p>)}
      </div>

      <div className="card">
        <h2 className="sec">Every target, last 30 days</h2>
        <table className="nsu-t">
          <thead><tr><th>Campaign</th><th>Target</th><th>Bid</th><th>Clicks</th><th>Spend</th><th>Sales</th><th>Orders</th><th>ROAS</th><th>Read</th></tr></thead>
          <tbody>
            {(a.watch || []).map((w, i) => (
              <tr key={i} className={w.kind === 'up' || w.kind === 'harvest' ? 'on' : ''}>
                <td className="mut">{w.campaign}</td><td>{w.name}</td><td>{money(w.bid)}</td><td>{num(w.clicks)}</td><td>{money(w.cost)}</td><td>{money(w.sales)}</td><td>{num(w.orders)}</td>
                <td className={w.roas == null ? '' : w.roas >= a.goal_roas ? 'bst-good' : 'bst-crit'}>{w.roas == null ? '–' : w.roas.toFixed(2)}</td>
                <td><span className={'bst-sig ' + (SIG[w.kind] || 'mut')} />{w.read}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(a.terms?.harvest?.length > 0 || a.terms?.negatives?.length > 0) && (
        <div className="card">
          <h2 className="sec">Search terms</h2>
          {a.terms.harvest?.length > 0 && <><p className="small mut">Winning terms (2+ orders at or above the goal) that become exact keywords or ASIN targets:</p>
            <ul>{a.terms.harvest.map((s, i) => <li key={i}><b>{s.term}</b> <span className="mut">{s.orders} orders, ROAS {s.roas?.toFixed(2)}, {money(s.cost)} · {s.status}</span></li>)}</ul></>}
          {a.terms.negatives?.length > 0 && <><p className="small mut">Terms with 3+ clicks and no order in 30 days, blocked as negatives:</p>
            <ul>{a.terms.negatives.map((s, i) => <li key={i}><b>{s.term}</b> <span className="mut">{s.clicks} clicks, {money(s.cost)} · {s.status}</span></li>)}</ul></>}
        </div>
      )}

      <div className="card">
        <h2 className="sec">Log, last 14 days</h2>
        {!log.length && <p className="mut">Nothing logged yet.</p>}
        {days.map((day) => (
          <div key={day} className="bst-day">
            <p className="nav-eyebrow">{day}</p>
            <table className="bst-log"><tbody>
              {log.filter((e) => e.t.startsWith(day)).map((e, i) => <tr key={i} className={e.status === 'OK' ? 'sent' : e.status === 'FAILED' ? 'fail' : ''}><td className="t">{hhmm(e.t)}</td><td className="w"><Line e={e} /></td></tr>)}
            </tbody></table>
          </div>
        ))}
      </div>
    </div>
  );
}
