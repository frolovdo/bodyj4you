import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// Budget boost: the hourly robot (Mac, adsops/ac_boost.py, every hour at :15 Pacific) and its reasoning. Data: dataset
// ACCOUNT/boost. The page refreshes itself every minute; a check older than 75 minutes is flagged (the Mac job did not run).
const money = (v) => (v == null ? '–' : '$' + (Number.isInteger(+v) || +v >= 20 ? Math.round(+v) : (+v).toFixed(2)));
const CODE = {
  boost: ['RAISED', 'good'], boosted: ['HOLDING', 'good'], below: ['NOTHING', 'crit'], room: ['WAITING', 'ok'],
  early: ['EARLY', 'mut'], window: ['NIGHT', 'mut'], nodata: ['NO DATA', 'mut'], reset: ['RESET', 'acc'],
};
const failed = (e) => /FAILED/.test(e?.head || e?.text || '');
// one log line: a signal, the bold headline, one plain reason (older entries only have the full text)
const Line = ({ e }) => {
  const [label, cls] = failed(e) ? ['FAILED', 'crit'] : (CODE[e.code] || ['–', 'mut']);
  return <><span className={'bst-sig ' + cls} />{e.head ? <><b>{e.head}.</b> <span className="mut">{e.why}</span></> : e.text}{e.mode === 'shadow' && e.code === 'boost' ? <span className="pill">shadow</span> : null}<span className="sr">{label}</span></>;
};
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '–');
const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

// Settings people change here: the ROAS level the robot compares against, and the base daily budget (sent to Amazon at once).
// Next to them, the campaign's own 90-day ROAS and the last 30 days, so the level is set against what the campaign really does.
function Settings({ c, csrf, canEdit, onSaved }) {
  const [level, setLevel] = useState(c.level?.value ?? c.roas90?.value ?? '');
  const [budget, setBudget] = useState(c.base ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const m = c.marks || {};
  const trend = m.roas90 != null && m.roas30 != null ? (m.roas30 >= m.roas90 * 1.1 ? 'up' : m.roas30 <= m.roas90 * 0.9 ? 'down' : 'flat') : null;
  const save = async () => {
    setBusy(true); setMsg('');
    const f = { csrf, cid: c.cid, name: c.name };
    if (level !== '' && Number(level) !== (c.level?.value ?? null)) f.level = Number(level);
    if (budget !== '' && Number(budget) !== Number(c.base)) f.budget = Number(budget);
    if (f.level == null && f.budget == null) { setBusy(false); setMsg('Nothing changed.'); return; }
    const r = await api('boost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || 'could not save'); return; }
    setMsg([f.level != null ? `Level ${f.level} saved; the robot uses it from its next check.` : '', f.budget != null ? `Budget on Amazon now $${r.budget}.` : '', r.warning || ''].filter(Boolean).join(' '));
    onSaved && onSaved();
  };
  return (
    <div className="bst-set">
      <div className="bst-ref">
        <span><b>90-day ROAS {m.roas90 == null ? '–' : m.roas90.toFixed(2)}</b> <span className="mut">({m.days90 || 0} active days)</span></span>
        <span><b>last 30 days {m.roas30 == null ? '–' : m.roas30.toFixed(2)}</b> {trend && <span className={'bst-tr ' + trend}>{trend === 'up' ? '▲ trending up' : trend === 'down' ? '▼ trending down' : '■ steady'}</span>}</span>
        {c.level?.value != null && <span className="mut">level {c.level.value} set {c.level.by ? 'by ' + c.level.by : 'in the config'}</span>}
      </div>
      {canEdit && (
        <div className="bst-form">
          <label>ROAS level <input type="number" step="0.1" min="0.1" value={level} onChange={(e) => setLevel(e.target.value)} /></label>
          <label>Daily budget $ <input type="number" step="1" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
          <button className="btn sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          {msg && <span className="small mut">{msg}</span>}
        </div>
      )}
    </div>
  );
}

function Campaign({ c, csrf, canEdit, onSaved }) {
  const [label, cls] = failed(c.decision) ? ['FAILED', 'crit'] : (CODE[c.decision?.code] || ['–', 'mut']);
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
          <div className="d">{c.boosted && c.budget_now === c.boosted ? <span>boosted from {money(c.base)} at {c.boosted_at}</span>
            : c.boosted ? <span>shadow boost to {money(c.boosted)} at {c.boosted_at}; Amazon still {money(c.budget_now)}</span> : <span>base {money(c.base)}</span>}</div></div>
        <div className="kpi"><div className="tl mut small">Budget used (Amazon)</div><div className="v">{pct == null ? '–' : Math.round(pct) + '%'}</div>
          <div className="bst-bar"><i style={{ width: (pct || 0) + '%' }} className={pct >= 80 ? 'hot' : ''} /></div>
          <div className="d">{c.usage_at ? 'as of ' + hhmm(new Date(c.usage_at).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' })) : ''}</div></div>
        <div className="kpi"><div className="tl mut small">ROAS today (expected) vs mark</div>
          <div className={'v ' + (above == null ? '' : above ? 'bst-good' : 'bst-crit')}>{t.roas == null ? '–' : t.roas.toFixed(2)} <span className="mut">/ {r90.value == null ? '–' : r90.value.toFixed(2)}</span></div>
          <div className="d">{t.roas_seen != null && <span>{t.roas_seen.toFixed(2)} seen so far, corrected with {t.lag_source || 'the lag curve'}</span>}<span>mark: {r90.source}</span></div></div>
        <div className="kpi"><div className="tl mut small">Today through {t.through || '–'}</div><div className="v">{money(t.cost)} <span className="mut">→ {money(t.sales)}</span></div>
          <div className="d"><span>{t.clicks ?? 0} clicks</span><span>{t.orders ?? 0} orders</span><span>{(t.impressions ?? 0).toLocaleString()} impr.</span></div></div>
      </div>
      <p className="bst-why"><Line e={c.decision} /></p>
      <Settings c={c} csrf={csrf} canEdit={canEdit} onSaved={onSaved} />
      {c.sent && <p className={'small ' + (c.sent.ok ? 'bst-good' : 'bst-crit')}>Sent to Amazon: {money(c.sent.from)} → {money(c.sent.to)} ({c.sent.note}).</p>}
      {c.note && <p className="small mut">{c.note}</p>}
    </div>
  );
}

export default function Boost({ csrf }) {
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
      {(b.campaigns || []).map((c) => <Campaign key={c.cid} c={c} csrf={csrf} canEdit={!!d.can_edit} onSaved={load} />)}
      <div className="card">
        <h2 className="sec">Hourly log, last 7 days</h2>
        {!log.length && <p className="mut">No checks logged yet.</p>}
        {days.map((day) => (
          <div key={day} className="bst-day">
            <p className="nav-eyebrow">{day}{day === b.day ? ' · today' : ''}</p>
            <table className="bst-log">
              <tbody>
                {log.filter((e) => e.t.startsWith(day)).map((e, i) => (
                  <tr key={i} className={e.sent ? 'sent' : failed(e) ? 'fail' : ''}>
                    <td className="t">{hhmm(e.t)}</td>
                    <td className="n">{e.name}</td>
                    <td className="w"><Line e={e} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
