import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// Budget boost: the hourly robot (Mac, adsops/ac_boost.py, every hour at :15 Pacific) and its reasoning. Data: dataset
// ACCOUNT/boost. The page refreshes itself every minute; a check older than 75 minutes is flagged (the Mac job did not run).
const money = (v) => (v == null ? '–' : '$' + (Number.isInteger(+v) || +v >= 20 ? Math.round(+v) : (+v).toFixed(2)));
const CODE = {
  boost: ['Boosted', 'good'], boosted: ['Boosted', 'good'], below: ['Below average: nothing', 'crit'], room: ['Performing, budget left', 'ok'],
  early: ['Too early', 'mut'], window: ['Outside window', 'mut'], nodata: ['No data', 'mut'], reset: ['Back to base', 'acc'],
};
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '–');
const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

function Campaign({ c }) {
  const [label, cls] = CODE[c.decision?.code] || ['–', 'mut'];
  const t = c.today || {};
  const r90 = c.roas90 || {};
  const pct = c.usage_pct == null ? null : Math.max(0, Math.min(100, c.usage_pct));
  const above = t.roas != null && r90.value != null ? t.roas >= r90.value : null;
  return (
    <div className="card bst-camp">
      <div className="bst-head">
        <div><b>{c.name}</b> <span className="pill">{c.type === 'AUTO' ? 'auto' : 'product'}</span></div>
        <span className={'pill st bst-' + cls}>{label}</span>
      </div>
      <div className="bst-grid">
        <div className="kpi"><div className="tl mut small">Budget today</div><div className="v">{money(c.budget_now)}</div>
          <div className="d">{c.boosted ? <span>boosted from {money(c.base)} at {c.boosted_at}</span> : <span>base {money(c.base)}</span>}</div></div>
        <div className="kpi"><div className="tl mut small">Budget used (Amazon)</div><div className="v">{pct == null ? '–' : Math.round(pct) + '%'}</div>
          <div className="bst-bar"><i style={{ width: (pct || 0) + '%' }} className={pct >= 80 ? 'hot' : ''} /></div>
          <div className="d">{c.usage_at ? 'as of ' + hhmm(new Date(c.usage_at).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' })) : ''}</div></div>
        <div className="kpi"><div className="tl mut small">ROAS today vs 90 days</div>
          <div className={'v ' + (above == null ? '' : above ? 'bst-good' : 'bst-crit')}>{t.roas == null ? '–' : t.roas.toFixed(2)} <span className="mut">/ {r90.value == null ? '–' : r90.value.toFixed(2)}</span></div>
          <div className="d">{r90.source}</div></div>
        <div className="kpi"><div className="tl mut small">Today through {t.through || '–'}</div><div className="v">{money(t.cost)} <span className="mut">→ {money(t.sales)}</span></div>
          <div className="d"><span>{t.clicks ?? 0} clicks</span><span>{t.orders ?? 0} orders</span><span>{(t.impressions ?? 0).toLocaleString()} impr.</span></div></div>
      </div>
      <p className="bst-why">{c.decision?.text}</p>
      {c.sent && <p className={'small ' + (c.sent.ok ? 'bst-good' : 'bst-crit')}>Sent to Amazon: {money(c.sent.from)} → {money(c.sent.to)} ({c.sent.note}).</p>}
      {c.note && <p className="small mut">{c.note}</p>}
    </div>
  );
}

export default function Boost() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const load = () => api('boost').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load')));
  useEffect(() => { load(); const id = setInterval(() => { load(); setTick((n) => n + 1); }, 60000); return () => clearInterval(id); }, []);
  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  const b = d.boost;
  if (!b) return <div className="card"><p className="mut">The boost robot has not reported yet. It runs on the Mac every hour at :15 (job "boost").</p></div>;
  const age = mins(b.as_of, d.now);
  const stale = age > 75;
  const log = [...(b.log || [])].reverse();
  const days = [...new Set(log.map((e) => e.t.slice(0, 10)))];
  return (
    <div className="bst">
      <div className={'card bst-top' + (stale ? ' block' : '')}>
        <div className="bst-head">
          <div>
            <span className={'pill st ' + (b.mode === 'live' ? 'bst-live' : 'bst-shadow')}>{b.mode === 'live' ? 'LIVE: sends budget changes' : 'SHADOW: decides, sends nothing'}</span>
            <span className="pill">campaigns matching “{b.match}”</span>
          </div>
          <div className="small">Last check {hhmm(b.as_of)} Pacific · {age < 1 ? 'just now' : age + ' min ago'}{stale ? ' · the hourly job has not reported for over 75 minutes' : ''}</div>
        </div>
        <p className="bst-rule">{b.rule}</p>
        {b.empty_reason && <p className="mut">{b.empty_reason}</p>}
      </div>
      {(b.campaigns || []).map((c) => <Campaign key={c.cid} c={c} />)}
      <div className="card">
        <h2 className="sec">Hourly log, last 7 days</h2>
        {!log.length && <p className="mut">No checks logged yet.</p>}
        {days.map((day) => (
          <div key={day} className="bst-day">
            <p className="nav-eyebrow">{day}{day === b.day ? ' · today' : ''}</p>
            <table className="bst-log">
              <tbody>
                {log.filter((e) => e.t.startsWith(day)).map((e, i) => {
                  const [label, cls] = CODE[e.code] || ['–', 'mut'];
                  return (
                    <tr key={i} className={e.sent ? 'sent' : ''}>
                      <td className="t">{hhmm(e.t)}</td>
                      <td className="n">{e.name}</td>
                      <td><span className={'pill st bst-' + cls}>{label}</span>{e.mode === 'shadow' && (e.code === 'boost') ? <span className="pill">shadow</span> : null}</td>
                      <td className="w">{e.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
