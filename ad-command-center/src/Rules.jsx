import React, { useEffect, useState } from 'react';
import { FAM } from './App.jsx';

// Rules. Top: apply one grade to every campaign shown. Then portfolios (folders) and campaigns inside, each folded to one
// reading line and the three grades with what each would do per month. Unfold a campaign: every parameter a rule can be set
// on, its 90-day and 30-day marks, the reading, and the graded rules (cut / reward) with the outcome each would have had.
// Grades: Conservative = sure, Moderate = likely, Radical = worth a try. A rule's own grade beats the campaign's, which beats
// the portfolio's, which beats "all". Built daily on the Mac (adsops/ac_rulebook.py); choices go to Supabase and into the
// hourly judge (shadow mode; nothing is sent to Amazon from here).
const hdr = (fam) => (fam ? { 'x-family': fam } : {});
const load = (fam) => fetch('/api/rulebook', { credentials: 'same-origin', headers: hdr(fam) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not load the rules.' }));
const save = (fam, csrf, patch) => fetch('/api/rulebook', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...hdr(fam) }, body: JSON.stringify({ csrf, ...patch }) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Could not save.' }));

const GRADES = ['conservative', 'moderate', 'radical'];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const pct = (v, d = 0) => (v == null ? '–' : (v * 100).toFixed(d) + '%');
const fmt = (kind, v) => {
  if (v == null) return '–';
  if (kind === 'x' || kind === 'num1') return Number(v).toFixed(1);
  if (kind === 'pct2') return pct(v, 2);
  if (kind === 'pct1') return pct(v, 1);
  if (kind === 'pct0') return pct(v, 0);
  if (kind === 'money2') return '$' + Number(v).toFixed(2);
  if (kind === 'money0') return '$' + Math.round(v);
  return String(v);
};
const moneyOrders = (s, o) => {
  s = Math.round(s); o = Math.round(o);
  if (s < 0 && o <= 0) return `saves ~$${-s} a month, gives up ~${-o} orders`;
  if (s >= 0 && o >= 0) return `about +${o} orders a month for +$${s}`;
  if (s < 0) return `about +${o} orders a month while saving ~$${-s}`;
  return `costs ~$${s} a month and loses ~${-o} orders`;
};

// The grade that applies: own choice, else the level above. 'off' = no rule.
const eff = (own, above) => (own ? (own === 'off' ? null : own) : above);
const srcOf = (own, aboveSrc) => (own ? 'own' : aboveSrc);

function Grades({ value, own, onPick, busy, texts, small }) {
  // value = effective grade; own = this level has its own choice; texts[k] = what that grade does per month
  return <div className={'rb-grades' + (small ? ' small' : '')}>
    {GRADES.map((k) => {
      const on = value === k;
      return <button key={k} type="button" disabled={busy} className={'rb-g ' + k + (on ? ' on' : '') + (on && !own ? ' inh' : '')} onClick={() => onPick(on && own ? null : k)}
        title={on ? (own ? 'Applied here. Click to let it follow the level above.' : 'Follows the level above. Click to set it here.') : 'Apply ' + cap(k)}>
        <b>{cap(k)}</b>{texts?.[k] ? <span>{texts[k]}</span> : null}
      </button>;
    })}
    <button type="button" disabled={busy} className={'rb-g off' + (own && value == null ? ' on' : '')} onClick={() => onPick(own && value == null ? null : 'off')} title="No rule here">Off</button>
  </div>;
}

function Param({ p, cid, choices, above, aboveSrc, today, onSave, busy }) {
  const trend = p.trend ? <span className={'rb-trend ' + p.trend}>{p.trend}</span> : null;
  return <div className="rb-param">
    <div className="rb-phd">
      <b>{p.label}</b>
      <span className="rb-marks"><span>90 days <b>{fmt(p.fmt, p.m90)}</b></span><span>last 30 <b>{fmt(p.fmt, p.m30)}</b></span>{trend}</span>
    </div>
    <p className="small rb-read">{p.read}</p>
    {p.note && <p className="small mut">{p.note}</p>}
    {['cut', 'reward'].filter((d) => p.rules?.[d]).map((d) => {
      const key = p.key + '.' + d;
      const own = choices.rules?.[cid]?.[key] || null;
      const g = eff(own, above);
      const rec = today?.rules?.[key];
      return <div key={d} className={'rb-rule ' + d}>
        <div className="rb-rtitle small"><b>{d === 'cut' ? 'Cut' : 'Reward'}</b>{rec ? <span className="mut"> · last 14 days: fired {rec.fired}, held {rec.held}{rec.today_hour != null ? ` · fired today at ${rec.today_hour}:00` : ''}</span> : null}</div>
        {GRADES.map((k) => {
          const r = p.rules[d][k];
          if (!r) return null;
          const on = g === k;
          return <div key={k} className={'rb-row' + (on ? ' on' : '') + (on && !own ? ' inh' : '')}>
            <button type="button" disabled={busy} className={'rb-g sm ' + k + (on ? ' on' : '') + (on && !own ? ' inh' : '')} onClick={() => onSave({ rules: { [cid]: { [key]: on && own ? null : k } } })} title={on ? (own ? 'Applied on this rule. Click to follow the campaign.' : 'Follows the ' + aboveSrc + '. Click to set it on this rule.') : 'Apply ' + cap(k) + ' to this rule'}>{cap(k)}</button>
            <div className="rb-rtext"><div>{r.text}</div><div className="small mut">{r.o.text}</div></div>
          </div>;
        })}
        <button type="button" disabled={busy} className={'rb-g sm off' + (own === 'off' ? ' on' : '')} onClick={() => onSave({ rules: { [cid]: { [key]: own === 'off' ? null : 'off' } } })}>{own === 'off' ? 'Off (click to follow)' : 'Off'}</button>
      </div>;
    })}
  </div>;
}

function Campaign({ c, choices, above, aboveSrc, today, onSave, busy }) {
  const [open, setOpen] = useState(false);
  const own = choices.campaigns?.[c.cid] || null;
  const g = eff(own, above);
  const src = srcOf(own, aboveSrc);
  const t = today[c.cid];
  const st = t?.status || '';
  const pill = st.startsWith('CUT') ? ['notyet', st] : st.startsWith('REWARD') ? ['ontrack', st] : st.startsWith('watching') ? ['', st] : st ? ['undone', st] : null;
  const texts = Object.fromEntries(GRADES.map((k) => [k, c.nets[k].text]));
  return <div className={'card rb-camp' + (c.state !== 'ENABLED' ? ' paused' : '')}>
    <div className="rb-chead" onClick={() => setOpen(!open)}>
      <div><b>{open ? '▾' : '▸'} {c.name}</b> <span className="mut small">· {c.type}{c.state !== 'ENABLED' ? ' · ' + c.state.toLowerCase() : ''}{c.hourly ? ' · hourly' : ''} · {c.n_rules} rules</span></div>
      {pill && <span className={'pill st ' + pill[0]}>{pill[1]}</span>}
    </div>
    <p className="rb-read">{c.read}</p>
    <div className="rb-apply"><span className="small mut">{g ? `${cap(g)} ${src === 'own' ? 'applied here' : 'from ' + src}` : 'No rules applied'}</span>
      <Grades value={g} own={!!own} busy={busy} texts={texts} onPick={(k) => onSave({ campaigns: { [c.cid]: k } })} /></div>
    {open && <div className="rb-params">
      <p className="small mut">Settings now: budget ${c.settings.budget ?? '–'}{c.settings.tos != null ? ` · top of search +${c.settings.tos}%` : ''}{c.settings.bids?.length ? ` · default bid $${c.settings.bids[0].toFixed(2)}` : ''}{c.target_acos ? ` · target ACoS ${pct(c.target_acos)}` : ''}. Same-day rules: cuts watch 10:00–22:00, rewards 12:00–20:00; everything returns to base at midnight.</p>
      {c.params.map((p) => <Param key={p.key} p={p} cid={c.cid} choices={choices} above={g} aboveSrc={src === 'own' ? 'campaign' : src} today={t} onSave={onSave} busy={busy} />)}
    </div>}
  </div>;
}

function Portfolio({ p, choices, above, today, onSave, busy, openDefault }) {
  const [open, setOpen] = useState(openDefault);
  const own = choices.portfolios?.[p.pid] || null;
  const g = eff(own, above);
  const src = own ? 'portfolio' : 'all';
  const texts = Object.fromEntries(GRADES.map((k) => [k, p.nets[k].text]));
  return <div className="rb-port">
    <div className="card rb-phead">
      <div className="rb-chead" onClick={() => setOpen(!open)}>
        <div><b>{open ? '▾' : '▸'} {p.name}</b> <span className="pill">{p.category}</span> <span className="mut small">· {p.n_enabled} of {p.campaigns.length} campaigns on{p.families.length ? ' · ' + p.families.join(', ') : ''}</span></div>
        <span className="small mut">{Math.round(p.marks.orders_day)} orders/day · ${p.marks.spend_day}/day · ACoS {pct(p.marks.acos)}</span>
      </div>
      <p className="rb-read">{p.read}</p>
      <div className="rb-apply"><span className="small mut">{g ? `${cap(g)} ${own ? 'applied to this portfolio' : 'from all'}` : 'No rules applied'} · applies to every campaign inside</span>
        <Grades value={g} own={!!own} busy={busy} texts={texts} onPick={(k) => onSave({ portfolios: { [p.pid]: k } })} /></div>
      {open && <div className="rb-params rb-pparams">
        {p.params.map((q) => <div key={q.key} className="rb-param"><div className="rb-phd"><b>{q.label}</b><span className="rb-marks"><span>90 days <b>{fmt(q.fmt, q.m90)}</b></span><span>last 30 <b>{fmt(q.fmt, q.m30)}</b></span>{q.trend ? <span className={'rb-trend ' + q.trend}>{q.trend}</span> : null}</span></div><p className="small rb-read">{q.read}</p></div>)}
      </div>}
    </div>
    {open && p.campaigns.map((c) => <Campaign key={c.cid} c={c} choices={choices} above={g} aboveSrc={src} today={today} onSave={onSave} busy={busy} />)}
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
    if (r.ok) { setD({ ...d, choices: r.choices }); setMsg('Saved. The hourly judge picks it up at the next run; nothing is sent to Amazon from here.'); } else setMsg(r.error || 'Could not save.');
    setBusy(false);
  };
  const ports = rb.portfolios || [];
  const ch = d.choices;
  const top = ch.all === 'off' ? null : ch.all || null;
  const nCamps = ports.reduce((n, p) => n + p.campaigns.length, 0);
  const texts = Object.fromEntries(GRADES.map((k) => {
    const s = ports.reduce((n, p) => n + p.nets[k].spend_month, 0), o = ports.reduce((n, p) => n + p.nets[k].orders_month, 0);
    return [k, moneyOrders(s, o)];
  }));
  const own = Object.keys(ch.portfolios || {}).length + Object.keys(ch.campaigns || {}).length + Object.values(ch.rules || {}).reduce((n, s) => n + Object.keys(s).length, 0);
  return <div className="rules">
    <div className="card rb-top">
      <div className="rb-chead"><div><b>Apply to all campaigns</b> <span className="mut small">· {ports.length} portfolios, {nCamps} campaigns, 90 days to {rb.window[1]}</span></div>
        <span className="small mut">{top ? `${cap(top)} applied to all` : 'Nothing applied to all'}{own ? ` · ${own} own choice${own > 1 ? 's' : ''} below` : ''}</span></div>
      <Grades value={top} own={!!ch.all} busy={busy} texts={texts} onPick={(k) => onSave({ all: k })} />
      <div className="rb-legend small">
        {GRADES.map((k) => <div key={k}><b className={'rb-trend ' + k}>{rb.levels[k].label}</b> — {rb.levels[k].sure}.</div>)}
      </div>
      <p className="small mut rb-note">Every rule is drawn from the campaign's own two marks: the 90-day average and the last 30 days. Cuts sit under the lower mark, rewards above the higher one; the grade sets how far. Outcomes are what the rule would have done on the campaign's own last 90 days (a same-day rule catches about half the day). {msg && <b>{msg}</b>}</p>
    </div>
    {ports.map((p, i) => <Portfolio key={p.pid} p={p} choices={ch} above={top} today={d.today} onSave={onSave} busy={busy} openDefault={!all || i === 0} />)}
    <p className="mut small">Built {rb.as_of?.slice(0, 16).replace('T', ' ')} PT. Hourly judge runs for {rb.hourly_families.join(', ') || 'no family yet'}; other families are checked on the day's numbers. Grades: <code>intel/_shared/rule_levels.json</code>. Only approvers and owners can apply.</p>
  </div>;
}
