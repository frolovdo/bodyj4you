import React, { useEffect, useState } from 'react';
import { FAM } from './App.jsx';

// Campaign Judge: one verdict per campaign for the current hour (Strong, On plan, Weak, Too early, Frozen) with the
// numbers behind it and the proposed change. Built hourly on the Mac (adsops/ac_judge.py --now --push, dataset
// <family>/judge_now). On "Whole account" every judged family is one table. Read-only in this phase: proposals are
// shown, not sendable yet.
const load = (fam) => fetch('/api/judge', { credentials: 'same-origin', headers: fam ? { 'x-family': fam } : {} }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not load the Judge.' }));

const ORDER = { Strong: 0, Weak: 1, 'On plan': 2, 'Too early': 3, Frozen: 4 };
const PILL = { Strong: 'ontrack', Weak: 'notyet', 'On plan': '', 'Too early': 'tooearly', Frozen: 'undone' };
const LETTER = { Strong: 'S', Weak: 'W', 'On plan': '·', 'Too early': 'e', Frozen: 'f' };
const money = (v) => '$' + Math.round(v || 0);
const pct = (v) => (v == null ? '' : Math.round(v * 100) + '%');
const hourLabel = (h) => (h == null ? '' : `${((h % 12) || 12)}${h < 12 ? ' am' : ' pm'}`);

function Strip({ s }) {
  if (!s || !s.length) return <span className="mut small">no replay</span>;
  return <span className="judge-strip" title={s.map((x) => `${x.day.slice(5)} ${x.v} ${x.s}`).join('\n')}>
    {s.map((x) => <i key={x.day} className={'js ' + (PILL[x.v] || 'plain')}>{LETTER[x.v]}</i>)}
  </span>;
}

export default function Judge() {
  const all = FAM.id === 'ACCOUNT';
  const [d, setD] = useState(null);
  useEffect(() => { load(all ? 'ACCOUNT' : FAM.id).then(setD); }, []);
  if (!d) return <p className="mut">Loading…</p>;
  if (!d.ok) return <p className="mut">{d.error || 'Could not load the Judge.'}</p>;
  const fams = d.families || [];
  if (!fams.length) return <div className="card"><p>No Judge data for this family yet. The Judge runs hourly on the Mac for the families in <code>adsops/judge_families.txt</code> (HS0002 first).</p></div>;
  const rows = fams.flatMap((f) => (f.rows || []).map((r) => ({ ...r, family: f.family }))).sort((a, b) => (ORDER[a.verdict] - ORDER[b.verdict]) || (b.score - a.score));
  const counts = {};
  rows.forEach((r) => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
  const f0 = fams[0];
  const asOf = f0.as_of ? f0.as_of.slice(11, 16) : '';
  const st = f0.settings || {};
  return (
    <div className="judge">
      <div className="card">
        <p style={{ margin: 0 }}><b>Judged at {asOf} PT</b>, with the data of {f0.day} through {hourLabel(f0.hour)}.
          {' '}{Object.keys(ORDER).filter((k) => counts[k]).map((k) => <span key={k} className={'pill st ' + PILL[k]} style={{ marginLeft: 6 }}>{k} {counts[k]}</span>)}</p>
        <p className="mut small" style={{ margin: '8px 0 0' }}>Each campaign is judged on today so far against its own normal hours (recent days weigh more, deal days apart) and against its peers in the same category today. Orders are corrected for the ones that have not arrived yet. <b>Strong</b> = ahead of its own hours and its peers with ad cost under the ceiling. <b>Weak</b> = behind both (a rank campaign needs {st.steps?.weak_rank_needs_consecutive_hours || 2} hours in a row). <b>Too early</b> = not enough clicks or orders yet today. <b>Frozen</b> = a deal edge, a recent change, or paused. Proposals are shown only; nothing is sent from this page yet.</p>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl judge-tbl">
          <thead><tr>
            {all && <th>Family</th>}<th>Campaign</th><th>Job</th><th>Verdict</th><th className="r">Score</th><th className="r">Clicks</th><th className="r">Orders</th><th className="r">Spend</th><th className="r">Sales</th><th className="r">ACoS</th><th>Proposed</th><th>Why</th><th>Last 14 days at 8 pm</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.family + r.cid}>
              {all && <td>{r.family}</td>}
              <td><b>{r.name}</b><div className="mut small">base ${r.base?.budget || '?'}{r.base?.placement?.PLACEMENT_TOP != null ? ` · TOS +${r.base.placement.PLACEMENT_TOP}%` : ''}{r.state === 'PAUSED' ? ' · paused' : ''}</div></td>
              <td>{r.job}</td>
              <td><span className={'pill st ' + PILL[r.verdict]}>{r.verdict}</span></td>
              <td className="r">{r.score}</td>
              <td className="r">{r.clicks}</td>
              <td className="r">{r.orders}</td>
              <td className="r">{money(r.cost)}</td>
              <td className="r">{money(r.sales)}</td>
              <td className="r">{r.sales ? pct(r.acos) : ''}</td>
              <td>{r.action || <span className="mut">none</span>}</td>
              <td className="small">{r.reasons}</td>
              <td><Strip s={r.strip} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="mut small">Peers: {[...new Set(rows.map((r) => r.peers))].join(', ')}. Thresholds: Strong from +{st.verdicts?.strong_min}, Weak under {st.verdicts?.weak_max}; floor = half the campaign's normal day, never under {st.confidence?.abs_min_clicks} clicks or {st.confidence?.abs_min_orders} orders. Steps: budget +{st.steps?.budget_up_pct_of_base}% of base a step (max +{st.steps?.budget_up_day_max_pct}% a day), top-of-search +{st.steps?.tos_up_points} points, bid −{st.steps?.bid_down_pct}%. Settings in <code>intel/_shared/judge.json</code>.</p>
    </div>
  );
}
