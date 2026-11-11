import React, { useEffect, useState } from 'react';
import { FAM } from './App.jsx';

// Rules: the north-star page. For every campaign: its benchmark (normal day), one Reward rule and one Slow-down rule
// written from that benchmark, whether each fired today, and the last 14 days' record of right and wrong calls.
// Built hourly on the Mac (adsops/ac_rules.py --push, dataset <family>/rules_now). Read-only: rules are shown and
// checked, nothing is sent from here yet. Rules are edited in intel/<family>/rules.json.
const load = (fam) => fetch('/api/judge', { credentials: 'same-origin', headers: fam ? { 'x-family': fam } : {} }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not load the rules.' }));

const money = (v) => (v == null ? '' : '$' + Math.round(v));
const pct = (v) => (v == null ? '–' : Math.round(v * 100) + '%');
const hh = (h) => (h == null ? '' : `${(h % 12) || 12} ${h < 12 ? 'am' : 'pm'}`);

function statusPill(t) {
  const s = t.status || '';
  const cls = s.startsWith('REWARD') ? 'ontrack' : s.startsWith('SLOW') ? 'notyet' : s.startsWith('waiting') ? '' : 'undone';
  const label = s.startsWith('REWARD') ? 'Reward fired' : s.startsWith('SLOW') ? 'Slow-down fired' : s.startsWith('waiting') ? 'Waiting' : s.startsWith('paused') ? 'Paused' : 'Frozen';
  return <span className={'pill st ' + cls}>{label}</span>;
}

// 14-day strip for one rule: a letter on the days it fired (green = right call, red = wrong), f = frozen day.
function Strip({ hist, kind }) {
  return <span className="judge-strip">
    {hist.map((h) => {
      if (h.frozen) return <i key={h.day} className="js undone" title={h.day + ' frozen'}>f</i>;
      const fired = kind === 'reward' ? h.reward_hour != null : h.slow_hour != null;
      const right = kind === 'reward' ? h.right_reward : h.right_slow;
      const tip = `${h.day.slice(5)}: ${h.orders} orders vs ${h.normal} normal, ACoS ${pct(h.acos)}${fired ? ` · fired ${hh(kind === 'reward' ? h.reward_hour : h.slow_hour)} · ${right ? 'right' : 'wrong'}` : ''}`;
      return <i key={h.day} className={'js ' + (fired ? (right ? 'ontrack' : 'notyet') : 'plain')} title={tip}>{fired ? (kind === 'reward' ? 'R' : 'S') : '·'}</i>;
    })}
  </span>;
}

function Card({ c }) {
  const reg = c.benchmark?.regular;
  const deal = c.benchmark?.deal;
  const t = c.today || {};
  return (
    <div className="card rule-card">
      <div className="rule-head">
        <div><b>{c.name}</b> <span className="mut small">· {c.job} · base {money(c.base?.budget)}{c.base?.placement?.PLACEMENT_TOP != null ? ` · TOS +${c.base.placement.PLACEMENT_TOP}%` : ''}</span></div>
        <div>{statusPill(t)}</div>
      </div>
      {!reg ? <p className="mut small">No history yet: nothing to benchmark.</p> : <>
        <p className="bench"><b>Normal day:</b> {reg.orders} orders · {money(reg.spend)} · {pct(reg.acos)} ACoS · {money(reg.cpo)} per order
          {deal && <span className="mut"> · deal day: {deal.orders} orders at {pct(deal.acos)}</span>}</p>
        <p className="small"><b>Today:</b> {t.frozen ? t.status : <>{t.orders} orders vs {t.normal} normal by {hh(t.hour)}{t.acos != null ? `, ACoS ${pct(t.acos)}` : ''}{t.status?.startsWith('REWARD') ? ` · reward fired at ${hh(t.reward_hour)}` : t.status?.startsWith('SLOW') ? ` · slow-down fired at ${hh(t.slow_hour)}` : ''}</>}</p>
        <div className="rule-row">
          <span className={'pill st ontrack'}>Reward{c.rules.reward.on ? '' : ' (off)'}</span>
          <span className="small">{c.rules.reward.text}</span>
          <Strip hist={c.history} kind="reward" />
        </div>
        <div className="rule-row">
          <span className={'pill st notyet'}>Slow down{c.rules.slow.on ? '' : ' (off)'}</span>
          <span className="small">{c.rules.slow.text}</span>
          <Strip hist={c.history} kind="slow" />
        </div>
        <p className="mut small" style={{ margin: '6px 0 0' }}>{c.working}</p>
      </>}
    </div>
  );
}

function NorthStar({ f, rows }) {
  const ns = f.north_star || {};
  const calls = f.calls || { reward: [0, 0], slow: [0, 0] };
  const ahead = ns.normal_to_hour ? Math.round((ns.today_orders / ns.normal_to_hour - 1) * 100) : null;
  const fired = rows.filter((c) => c.today?.status?.startsWith('REWARD')).length;
  const slowed = rows.filter((c) => c.today?.status?.startsWith('SLOW')).length;
  return (
    <div className="card">
      <div className="kpis">
        <div className="kpi"><div className="tl mut small">Goal</div><div className="v">{ns.goal_orders_day || '–'} <span className="small mut">ad orders a day</span></div><div className="d">at {pct(ns.tacos_aim)} TACoS, max {pct(ns.tacos_max)}</div></div>
        <div className="kpi"><div className="tl mut small">Benchmark</div><div className="v">{ns.benchmark_orders_day} <span className="small mut">orders a normal day</span></div><div className="d">sum of every campaign's normal day</div></div>
        <div className="kpi"><div className="tl mut small">Today by {hh(f.hour)}</div><div className="v">{ns.today_orders} <span className="small mut">vs {ns.normal_to_hour} normal</span></div><div className="d">{ahead == null ? '' : (ahead >= 0 ? '+' : '') + ahead + '% against normal'}</div></div>
        <div className="kpi"><div className="tl mut small">Rules today</div><div className="v">{fired} <span className="small mut">rewards</span> · {slowed} <span className="small mut">slow-downs</span></div><div className="d">would have fired; nothing sent yet</div></div>
        <div className="kpi"><div className="tl mut small">Last 14 days</div><div className="v">{calls.reward[1]}/{calls.reward[0]} <span className="small mut">rewards right</span></div><div className="d">{calls.slow[1]}/{calls.slow[0]} slow-downs right</div></div>
      </div>
      <p className="mut small" style={{ margin: 0 }}>Normal day = the campaign's own last 60 days by weekday and hour, recent weeks weighing more, deal days apart. <b>Reward</b> = ahead of normal on orders with ACoS not worse than normal → more budget today. <b>Slow down</b> = behind normal for 2 hours while still spending → lower bids. A call is right when the day ended the way the rule assumed. Days within 3 days of a deal edge are frozen.</p>
    </div>
  );
}

export default function Judge() {
  const all = FAM.id === 'ACCOUNT';
  const [d, setD] = useState(null);
  useEffect(() => { load(all ? 'ACCOUNT' : FAM.id).then(setD); }, []);
  if (!d) return <p className="mut">Loading…</p>;
  if (!d.ok) return <p className="mut">{d.error || 'Could not load the rules.'}</p>;
  const fams = d.families || [];
  if (!fams.length) return <div className="card"><p>No rules for this family yet. The Mac builds them hourly for the families in <code>adsops/judge_families.txt</code> (HS0002 first).</p></div>;
  if (!all) {
    const f = fams[0];
    const rows = (f.campaigns || []).filter((c) => c.benchmark?.regular?.orders > 0 || c.state === 'ENABLED');
    return <div className="rules">
      <NorthStar f={f} rows={rows} />
      {rows.map((c) => <Card key={c.cid} c={c} />)}
      <p className="mut small">Built {f.as_of?.slice(11, 16)} PT. Rules file: <code>{f.rules_file}</code>; steps in <code>intel/_shared/judge.json</code>.</p>
    </div>;
  }
  const rows = fams.flatMap((f) => (f.campaigns || []).filter((c) => c.benchmark?.regular?.orders > 0).map((c) => ({ ...c, family: f.family })));
  return (
    <div className="rules">
      {fams.map((f) => <NorthStar key={f.family} f={f} rows={f.campaigns || []} />)}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl judge-tbl">
          <thead><tr><th>Family</th><th>Campaign</th><th>Normal day</th><th>Today</th><th>Status</th><th>Reward 14d</th><th>Slow-down 14d</th></tr></thead>
          <tbody>{rows.map((c) => {
            const reg = c.benchmark.regular; const t = c.today || {};
            return <tr key={c.family + c.cid}>
              <td>{c.family}</td><td><b>{c.name}</b><div className="mut small">{c.job} · base {money(c.base?.budget)}</div></td>
              <td className="small">{reg.orders} orders · {money(reg.spend)} · {pct(reg.acos)}</td>
              <td className="small">{t.frozen ? t.status : `${t.orders} vs ${t.normal} by ${hh(t.hour)}`}</td>
              <td>{statusPill(t)}</td>
              <td><Strip hist={c.history} kind="reward" /> <span className="small mut">{c.calls.reward[1]}/{c.calls.reward[0]}</span></td>
              <td><Strip hist={c.history} kind="slow" /> <span className="small mut">{c.calls.slow[1]}/{c.calls.slow[0]}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
