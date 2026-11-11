import React, { useEffect, useState } from 'react';
import { FAM } from './App.jsx';

// Rules: portfolios → campaigns. For each campaign: what we can change, how it ran over 90 days against its category
// benchmark, the 30-day trend, suggestions phrased as outcomes, and three rule layers (Optimistic / Realistic /
// Conservative) with the outcome each would have produced. A layer applies to a whole portfolio in one click, or to one
// campaign. Built daily on the Mac (adsops/ac_rulebook.py); choices go to Supabase and into the hourly judge's rules.
const hdr = (fam) => (fam ? { 'x-family': fam } : {});
const load = (fam) => fetch('/api/rulebook', { credentials: 'same-origin', headers: hdr(fam) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not load the rules.' }));
const save = (fam, csrf, patch) => fetch('/api/rulebook', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...hdr(fam) }, body: JSON.stringify({ csrf, ...patch }) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not save.' }));

const LAYERS = ['optimistic', 'realistic', 'conservative'];
const money = (v) => (v == null ? '–' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString());
const pct = (v, d = 0) => (v == null ? '–' : (v * 100).toFixed(d) + '%');
const num = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d));
const sgn = (v, unit = '%') => (v == null ? '–' : (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + unit);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function Spark({ data }) {
  if (!data || !data.length) return null;
  const w = 120, h = 28, max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ');
  return <svg className="rb-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function Metric({ label, value, vs, better }) {
  const cls = vs ? (vs.verdict === 'better' ? 'good' : vs.verdict === 'worse' ? 'bad' : '') : '';
  return <div className={'rb-m ' + cls}><div className="tl mut small">{label}</div><div className="v">{value}</div>{vs && <div className="d">{vs.verdict}{better != null ? ` · ${better}` : ''}</div>}</div>;
}

function Strip({ strip }) {
  return <span className="judge-strip">{(strip || []).map((s) => <i key={s.d} className={'js ' + (s.v === 'R' ? 'ontrack' : s.v === 'S' ? 'notyet' : 'plain')} title={s.d.slice(5)}>{s.v === ' ' ? '' : s.v}</i>)}</span>;
}

function LayerButtons({ value, suggested, inherited, onPick, busy, totals }) {
  return <div className="rb-layers">
    {LAYERS.map((k) => {
      const on = value === k;
      const t = totals?.[k];
      return <button key={k} type="button" disabled={busy} className={'btn rb-lbtn ' + k + (on ? ' on' : '') + (inherited && on ? ' inh' : '')} onClick={() => onPick(on && !inherited ? null : k)} title={on ? (inherited ? 'Follows the portfolio. Click to set it on this campaign.' : 'Applied. Click to remove.') : 'Apply ' + cap(k)}>
        {cap(k)}{suggested === k ? ' ★' : ''}{t ? <span className="small mut"> {sgn(t.orders_month / 100, '')} orders · {money(t.spend_month)}/mo</span> : null}
      </button>;
    })}
    {value && !inherited && <button type="button" disabled={busy} className="btn rb-lbtn off" onClick={() => onPick(null)}>None</button>}
  </div>;
}

function Campaign({ c, choices, today, csrf, onSave, busy, hourlyFamilies }) {
  const [open, setOpen] = useState(false);
  const own = choices.campaigns?.[c.cid] || null;
  const fromPort = choices.portfolios?.[c.pid] || null;
  const eff = own || fromPort;
  const t = today[c.cid];
  const p = c.p90, tr = c.trend;
  const st = t?.status || '';
  const pill = st.startsWith('REWARD') ? ['ontrack', 'Reward fired ' + (t.hour != null ? `by ${t.hour}:00` : '')] : st.startsWith('SLOW') ? ['notyet', 'Slow-down fired'] : st.startsWith('waiting') ? ['', 'Hourly: waiting'] : eff ? ['', cap(eff) + (own ? '' : ' (portfolio)')] : ['undone', 'No layer'];
  return <div className={'card rb-camp' + (c.state !== 'ENABLED' ? ' paused' : '')}>
    <div className="rule-head">
      <div><b>{c.name}</b> <span className="mut small">· {c.type}{c.state !== 'ENABLED' ? ' · ' + c.state.toLowerCase() : ''}{c.job ? ' · ' + c.job : ''}{c.family ? ' · ' + c.family : ''}{c.hourly ? ' · hourly rules' : ''}</span></div>
      <div><span className={'pill st ' + pill[0]}>{pill[1]}</span></div>
    </div>
    <div className="rb-chips">{c.can_change.map((x) => <span key={x.what} className="rb-chip"><span className="mut">{x.what}</span> {x.now}</span>)}</div>
    <div className="rb-metrics">
      <Metric label="Orders / day" value={num(p.orders_day)} />
      <Metric label="Spend / day" value={money(p.spend_day)} />
      <Metric label="ACoS" value={pct(p.acos)} vs={c.vs.acos} />
      <Metric label="ROAS" value={num(p.roas)} vs={c.vs.roas} />
      <Metric label="CTR" value={pct(p.ctr, 2)} vs={c.vs.ctr} />
      <Metric label="CVR" value={pct(p.cvr)} vs={c.vs.cvr} />
      <Metric label="CPC" value={p.cpc == null ? '–' : '$' + num(p.cpc, 2)} vs={c.vs.cpc} />
      <div className="rb-m"><div className="tl mut small">Budget ran out</div><div className="v">{c.capped.days}<span className="small mut"> of {p.active_days} days</span></div><div className="d">{c.capped.days30} of the last 30</div></div>
      <div className="rb-m trend"><div className="tl mut small">Orders, last 30 days</div><Spark data={tr.orders_series} /><div className="d">{sgn(tr.orders_pct)} orders · {sgn(tr.spend_pct)} spend{tr.acos_pts != null ? ` · ACoS ${sgn(tr.acos_pts, ' pts')}` : ''}</div></div>
    </div>
    <p className="small" style={{ margin: '8px 0 2px' }}>{c.comment}</p>
    <p className="small mut" style={{ margin: '0 0 8px' }}>{c.trend_comment}</p>
    <div className="rb-sugg">{c.suggestions.map((s, i) => <div key={i} className={'rb-s ' + s.kind}><b>{s.do}.</b> {s.get}</div>)}</div>
    <div className="rb-layer-row">
      <div className="small mut">Layer{eff ? '' : ' (none applied)'} · suggested: <b>{cap(c.suggested_layer)}</b> — {c.suggested_why}</div>
      <LayerButtons value={eff} suggested={c.suggested_layer} inherited={!own && !!fromPort} busy={busy} onPick={(k) => onSave({ campaigns: { [c.cid]: k } })} />
    </div>
    <div className="rb-outcomes">
      {LAYERS.map((k) => { const L = c.layers[k]; return <div key={k} className={'rb-o ' + k + (eff === k ? ' on' : '')}>
        <div className="small"><b>{cap(k)}</b>{c.suggested_layer === k ? ' ★' : ''}</div>
        <div className="small">{L.outcome.text}</div>
        <Strip strip={L.outcome.strip} />
        {open && <div className="small mut rb-rules"><div><b>Reward:</b> {L.reward}</div><div><b>Slow down:</b> {L.slow}</div></div>}
      </div>; })}
    </div>
    <div className="small mut rb-foot">
      <button type="button" className="linkbtn" onClick={() => setOpen(!open)}>{open ? 'Hide the rules' : 'Show the rules behind each layer'}</button>
      {t?.calls ? <span> · Hourly check, last 14 days: rewards right {t.calls.reward[1]} of {t.calls.reward[0]}, slow-downs right {t.calls.slow[1]} of {t.calls.slow[0]}{t.layer ? ` · running the ${cap(t.layer)} layer` : ''}</span> : (eff && !c.hourly ? <span> · Not in the hourly judge yet: the layer is checked nightly on the day's numbers until {c.family || 'its family'} is onboarded.</span> : null)}
    </div>
  </div>;
}

function Portfolio({ p, choices, today, csrf, onSave, busy, openDefault }) {
  const [open, setOpen] = useState(openDefault);
  const val = choices.portfolios?.[p.pid] || null;
  const own = p.campaigns.filter((c) => choices.campaigns?.[c.cid]).length;
  return <div className="rb-port">
    <div className="card rb-phead">
      <div className="rb-ptitle" onClick={() => setOpen(!open)}>
        <b>{open ? '▾' : '▸'} {p.name}</b> <span className="pill">{p.category}</span>
        <span className="mut small"> · {p.n_enabled} of {p.campaigns.length} campaigns on{p.families.length ? ' · ' + p.families.join(', ') : ''}</span>
      </div>
      <div className="rb-pkpis small">
        <span><b>{num(p.p90.orders_day)}</b> orders/day</span>
        <span><b>{money(p.p90.spend_day)}</b> /day</span>
        <span className={p.vs_acos ? (p.vs_acos.verdict === 'better' ? 'good' : p.vs_acos.verdict === 'worse' ? 'bad' : '') : ''}><b>{pct(p.p90.acos)}</b> ACoS{p.vs_acos ? ` (${p.vs_acos.verdict} than ${p.category})` : ''}</span>
        <span><b>{sgn(p.trend_orders_pct)}</b> orders, 30 days</span>
      </div>
      <div className="rb-layer-row">
        <div className="small mut">Apply to every campaign in this portfolio · suggested: <b>{cap(p.suggested_layer)}</b>{own ? ` · ${own} campaign${own > 1 ? 's' : ''} set on their own` : ''}</div>
        <LayerButtons value={val} suggested={p.suggested_layer} busy={busy} totals={p.layers} onPick={(k) => onSave({ portfolios: { [p.pid]: k } })} />
      </div>
    </div>
    {open && p.campaigns.map((c) => <Campaign key={c.cid} c={c} choices={choices} today={today} csrf={csrf} onSave={onSave} busy={busy} />)}
  </div>;
}

export default function Rules({ csrf, user }) {
  const all = FAM.id === 'ACCOUNT';
  const fam = all ? 'ACCOUNT' : FAM.id;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { load(fam).then(setD); }, []);
  if (!d) return <p className="mut">Loading…</p>;
  if (!d.ok) return <p className="mut">{d.error || 'Could not load the rules.'}</p>;
  const rb = d.rulebook;
  if (!rb) return <div className="card"><p>No rulebook yet. The Mac builds it daily at 9:05 (<code>tools/macjobs/run.sh rulebook</code>).</p></div>;
  const onSave = async (patch) => {
    setBusy(true); setMsg('');
    const r = await save(fam, csrf, patch);
    if (r.ok) { setD({ ...d, choices: r.choices }); setMsg('Saved. Managed campaigns pick it up at the next hourly run; nothing is sent to Amazon from here.'); } else setMsg(r.error || 'Could not save.');
    setBusy(false);
  };
  const a = rb.account;
  const bm = Object.values(rb.benchmarks || {});
  const ports = rb.portfolios || [];
  return <div className="rules">
    <div className="card">
      <div className="kpis">
        <div className="kpi"><div className="tl mut small">90 days, whole account</div><div className="v">{num(a.orders_day, 0)} <span className="small mut">orders a day</span></div><div className="d">{money(a.spend_day)} a day · ACoS {pct(a.acos)} · ROAS {num(a.roas)}</div></div>
        <div className="kpi"><div className="tl mut small">Shown here</div><div className="v">{ports.length} <span className="small mut">portfolios</span></div><div className="d">{ports.reduce((n, p) => n + p.campaigns.length, 0)} campaigns · {rb.window[0]} to {rb.window[1]}</div></div>
        <div className="kpi"><div className="tl mut small">Layers applied</div><div className="v">{Object.keys(d.choices.portfolios || {}).length} <span className="small mut">portfolios</span> · {Object.keys(d.choices.campaigns || {}).length} <span className="small mut">campaigns</span></div><div className="d">hourly rules run for {rb.hourly_families.join(', ') || 'no family yet'}</div></div>
      </div>
      <table className="tbl rb-bench"><thead><tr><th>Category benchmark</th><th>Campaigns</th><th>ACoS</th><th>ROAS</th><th>CTR</th><th>CVR</th><th>CPC</th><th>Median orders/day</th></tr></thead>
        <tbody>{bm.map((b) => <tr key={b.name}><td><b>{b.name}</b></td><td>{b.campaigns}</td><td>{pct(b.acos)}</td><td>{num(b.roas)}</td><td>{pct(b.ctr, 2)}</td><td>{pct(b.cvr)}</td><td>${num(b.cpc, 2)}</td><td>{num(b.orders_day_median)}</td></tr>)}</tbody></table>
      <div className="rb-legend small">
        {LAYERS.map((k) => <div key={k} className={'rb-o ' + k}><b>{rb.layers[k].label}</b> — {rb.layers[k].aim}. Reward: ahead by {Math.round((rb.layers[k].reward.orders_mult - 1) * 100)}%+ at ACoS ≤ {Math.round(rb.layers[k].reward.acos_tol * 100)}% of normal → budget +{rb.layers[k].reward.budget_up_pct}% (max +{rb.layers[k].reward.budget_day_max_pct}%). Slow: ≤ {Math.round(rb.layers[k].slow.orders_mult * 100)}% of normal for {rb.layers[k].slow.hours_in_a_row} h → bids −{rb.layers[k].slow.bid_down_pct}%.</div>)}
      </div>
      <p className="mut small" style={{ margin: '8px 0 0' }}>Normal = the campaign's own last 90 days (hourly judge: its own weekday-and-hour curve). ★ = the layer the numbers point to. Outcomes are estimates from the campaign's own days (a 10% bid cut ≈ −13% spend, −8% orders; extra budget only converts on days the budget ran out). {msg && <b>{msg}</b>}</p>
    </div>
    {ports.map((p, i) => <Portfolio key={p.pid} p={p} choices={d.choices} today={d.today} csrf={csrf} onSave={onSave} busy={busy} openDefault={!all || i === 0} />)}
    <p className="mut small">Built {rb.as_of?.slice(0, 16).replace('T', ' ')} PT. Layers: <code>intel/_shared/rule_layers.json</code>. Only approvers and owners can apply a layer.</p>
  </div>;
}
