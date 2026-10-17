import React, { useEffect, useMemo, useState } from 'react';
import { api } from './App.jsx';
import Popup from './Popup.jsx';

const money = (v, d = 0) => (v == null || isNaN(v) ? '-' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(d) + '%');
const SUCC = [['orders_up', 'more orders/day'], ['acos_down', 'lower ad cost per $100'], ['spend_up_acos_ok', 'more spend at acceptable ad cost'], ['rank_up', 'better organic rank']];

function Move({ now, ref_, up }) {
  if (now == null || !ref_) return <span className="mut">n/a</span>;
  const d = (100 * (now - ref_)) / ref_;
  if (Math.abs(d) < 5) return <span className="mut">flat</span>;
  const good = up === null ? null : (d > 0) === up;
  return <span className={good === null ? 'mut' : good ? 'good' : 'bad'}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}%</span>;
}

export function FiveNumbers({ five }) {
  if (!five) return null;
  const fmt = (k, v) => (k === 'ord_d' ? Number(v).toFixed(0) : k === 'cpc' ? money(v, 2) : k === 'acos' ? money(v) : pct(v));
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 4px' }}>Five numbers that matter now</h2>
      <div className="mut small">Last 7 days, and the move against the 30 and 90 day averages (under 5% counts as flat).</div>
      <div className="tiles">{five.filter((t) => t.v7 != null).map((t) => (
        <div className="tile" key={t.key}><span className="tl">{t.label}</span><b>{fmt(t.key, t.v7)}</b>
          <span className="tv">vs 30 days <Move now={t.v7} ref_={t.v30} up={t.up} /></span><span className="tv">vs 90 days <Move now={t.v7} ref_={t.v90} up={t.up} /></span></div>))}</div>
    </div>
  );
}

export function Response({ response }) {
  if (!response?.length) return null;
  const f = (el, pt_) => ({ clk: 100 * (Math.pow(1.1, el) - 1), cpc: 100 * (Math.pow(1.1, pt_) - 1), spend: 100 * (Math.pow(1.1, el + pt_) - 1) });
  return (
    <div className="card"><div className="lbl">Before you change a bid: what a 10% higher bid did in the past, per campaign</div>
      <div className="hz">{response.map((r, i) => { const x = f(r.clk, r.cpc); return (
        <div className={'chip' + (r.own ? ' good' : '')} key={i}><div className="n">{r.name.replace(' - AI', '')}</div><b>+10% bid → {x.clk >= 0 ? '+' : ''}{x.clk.toFixed(0)}% clicks</b>
          <div className="n">cost per click {x.cpc >= 0 ? '+' : ''}{x.cpc.toFixed(0)}% · spend about {x.spend >= 0 ? '+' : ''}{x.spend.toFixed(0)}%{r.days ? ` · ${r.days} keyword-days` : r.lo != null ? ` · clicks range ${(100 * (Math.pow(1.1, r.lo) - 1)).toFixed(0)} to ${(100 * (Math.pow(1.1, r.hi) - 1)).toFixed(0)}%` : ''}</div></div>); })}</div>
      <div className="mut small" style={{ marginTop: 6 }}>Clicks rising faster than the bid means the campaign is bid-starved. Campaigns not shown have had too few bid changes to measure; uncertain.</div>
    </div>
  );
}

export default function Update({ csrf }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [vals, setVals] = useState({});
  const [hyps, setHyps] = useState({});
  const [pop, setPop] = useState(null);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [staged, setStaged] = useState(null);

  const load = () => api('campaigns').then((r) => { if (r.ok) setD(r); else setError(r.error || 'could not load'); });
  useEffect(() => { load(); }, []);
  useEffect(() => {  // values carried from the Dashboard: #/update?set=cid:b=93;cid:t=10&why=...
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    const set = q.get('set'); if (!set) return;
    const v = {};
    for (const part of set.split(';')) { const m = /^(\d+):(\w+)=([\d.]+)$/.exec(part); if (!m) continue; const [, cid, key, val] = m; v[key === 'b' || key === 't' || key === 'p' || key === 'r' ? `${key}_${cid}` : key.startsWith('k') ? 'kw_' + key.slice(1) : key] = val; }
    setVals(v);
    const why = q.get('why'); if (why) setHyps((h) => ({ ...h, _prefill: why }));
  }, []);

  const live = useMemo(() => {
    const m = {};
    for (const c of d?.campaigns || []) {
      if (c.typ !== 'SP') continue;
      m['b_' + c.id] = String(c.budget); m['t_' + c.id] = String(c.pb.PLACEMENT_TOP || 0); m['p_' + c.id] = String(c.pb.PLACEMENT_PRODUCT_PAGE || 0); m['r_' + c.id] = String(c.pb.PLACEMENT_REST_OF_SEARCH || 0);
      for (const k of c.keywords) m['kw_' + k.keywordId] = String(k.bid);
      for (const t of c.targets) m['tg_' + t.targetId] = String(t.bid);
    }
    return m;
  }, [d]);
  const cidOfField = (f) => { if (/^[btpr]_/.test(f)) return f.slice(2); for (const c of d?.campaigns || []) { if (c.keywords?.some((k) => 'kw_' + k.keywordId === f) || c.targets?.some((t) => 'tg_' + t.targetId === f)) return c.id; } return null; };
  const changed = Object.entries(vals).filter(([k, v]) => k in live && String(v).trim() !== '' && String(v).trim() !== live[k]);
  const touched = [...new Set(changed.map(([k]) => cidOfField(k)).filter(Boolean))];
  const missing = touched.filter((cid) => ((hyps[cid] || hyps._prefill || '').trim().length < 10));
  const sp = (d?.campaigns || []).filter((c) => c.typ === 'SP' && c.state === 'ENABLED');
  const fixed = (d?.campaigns || []).filter((c) => c.typ !== 'SP' && c.state === 'ENABLED').reduce((s, c) => s + c.budget, 0);
  const tbLive = sp.reduce((s, c) => s + c.budget, 0) + fixed;
  const tbNow = sp.reduce((s, c) => s + (parseFloat(vals['b_' + c.id]) || c.budget), 0) + fixed;

  const form = () => { const f = { csrf }; for (const [k, v] of changed) f[k] = v; for (const cid of touched) { f['hyp_' + cid] = hyps[cid] || hyps._prefill || ''; f['succ_' + cid] = hyps['succ_' + cid] || 'orders_up'; f['days_' + cid] = hyps['days_' + cid] || '14'; } return f; };
  const post = (path, bodyObj) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) });

  const review = async () => {
    if (!touched.length) return;
    if (missing.length) { const el = document.getElementById('hyp_' + missing[0]); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.focus(); return; }
    setPop({ title: 'Send these changes to Amazon?', label: 'Yes, send now' }); setPreview(null); setProgress(null); setResult(null);
    setPreview(await post('preview', form()));
  };
  const confirm = async () => {
    const steps = [{ label: 'Backup and record', state: 'run' }, { label: 'Send to Amazon', state: '' }, { label: 'Read back and verify', state: '' }];
    setProgress([...steps]);
    const s1 = await post('send', { ...form(), step: 'stage' });
    if (!s1.ok) { setResult({ ok: false, text: s1.error || 'could not stage' }); return; }
    setStaged(s1.id); steps[0] = { ...steps[0], state: 'done', note: s1.id }; steps[1].state = 'run'; setProgress([...steps]);
    const s2 = await post('send', { csrf, step: 'execute', id: s1.id });
    steps[1] = { ...steps[1], state: s2.ok ? 'done' : 'fail', note: `${s2.sent || 0} sent${s2.failed ? `, ${s2.failed} failed` : ''}` }; steps[2].state = 'run'; setProgress([...steps]);
    const s3 = await post('send', { csrf, step: 'verify', id: s1.id });
    steps[2] = { ...steps[2], state: s3.ok ? 'done' : 'fail' }; setProgress([...steps]);
    setResult({ ok: s2.ok && s3.ok, sentAny: (s2.sent || 0) > 0, skipped: s2.skipped, text: `${s1.title}: ${s2.summary || `${s2.sent || 0} sent, ${s2.failed || 0} failed`}. ${s3.diffs?.length ? '' : 'Amazon holds what was asked.'}`, diffs: s3.diffs, errors: s2.errors });
    load(); setVals({}); setHyps({});
  };
  const close = async () => { if (staged && !result && progress) { /* mid-flight: leave it */ } else if (staged && !result) await post('send', { csrf, step: 'cancel', id: staged }); setPop(null); setStaged(null); };

  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading live settings and the numbers…</p>;
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const Input = ({ name, hot }) => <input className={(vals[name] != null && String(vals[name]).trim() !== '' && String(vals[name]).trim() !== live[name] ? 'chg ' : '') + (hot ? 'hot' : '')} value={vals[name] ?? live[name] ?? ''} onChange={(e) => set(name, e.target.value)} inputMode="decimal" />;

  return (
    <>
      <p className="mut small">Live settings read {d.live_at} PT · numbers through {d.endm} (newer days still filling in) · <a href="#/update" onClick={(e) => { e.preventDefault(); load(); }}>refresh</a></p>
      <div className="card strip"><span>Share of 'rosehip oil' purchases <b>{d.strip?.share != null ? pct(d.strip.share, 1) : '-'}</b></span><span>Organic rank <b>#{d.strip?.rank ?? '-'}</b> <span className="mut">(best #{d.strip?.rank_best ?? '-'})</span></span><a href="#/dashboard" style={{ marginLeft: 'auto' }}>Full analysis →</a></div>
      <FiveNumbers five={d.five} />
      <Response response={d.response} />
      {hyps._prefill && <div className="note pend">Values from {hyps._prefill} are filled in below (highlighted). Check them, write why, then review and send.</div>}
      <h2>Campaigns: change the numbers here</h2>
      <div className="totals"><span>Total daily budget we set <b>{money(tbNow)}</b> {Math.abs(tbNow - tbLive) >= 0.5 && <span className="mut">({tbNow > tbLive ? '+' : '−'}{money(Math.abs(tbNow - tbLive))} vs live)</span>}</span><span>Spent per day, last 7 days <b>{money(d.spent7)}</b></span><span>Used <b>{tbNow ? pct((100 * d.spent7) / tbNow) : '-'}</b></span></div>
      {d.campaigns.map((c) => {
        const k0 = c.k0 || {}, k30 = c.k30 || {};
        const acosT = (k) => (k.acos == null && k.cost > 0 ? `no sales (${money(k.cost)} spent)` : money(k.acos));
        const isTouched = touched.includes(c.id);
        const sugg = [...(c.keywords || []), ...(c.targets || [])].filter((x) => x.suggest != null);
        if (c.typ !== 'SP') return (
          <div className="card camp" key={c.id}><div className="chead"><span className="nm">{c.name}</span><span className="pill">SB {c.state}</span></div>
            <div className="stats"><span>spend/day <b>{money((k30.cost || 0) / (c.act30 || 30))}</b></span><span>orders/day <b>{((k30.orders || 0) / (c.act30 || 30)).toFixed(1)}</b></span><span>ad cost per $100 <b>{money(k30.acos)}</b></span></div>
            <div className="edit"><label>Daily budget<span className="big">{money(c.budget)}</span></label><span className="bspent">Banner: counted in the total budget above, never edited by this tool (charter).</span></div></div>);
        return (
          <div className={'card camp' + (isTouched ? ' changed' : '')} key={c.id}>
            <div className="chead"><span className="nm">{c.name}</span><span className="pill">SP {c.state}</span>{c.job && <span className="pill">{c.job}</span>}</div>
            <div className="stats"><span>spend/day <b>{money((k0.cost || 0) / (c.act7 || 7))}</b></span><span>orders <b>{k0.orders ?? '-'}</b></span><span>ad cost per $100 <b>{acosT(k0)}</b></span>{c.new ? <span className="small mut">new: {c.act7} days of spend</span> : c.early != null && c.early <= 16 ? <span className="small">budget gone ~{c.early}:00</span> : null}</div>
            <div className="avg">ad cost now <b>{acosT(k0)}</b>, 30d <b>{acosT(k30)}</b> | orders/day now <b>{((k0.orders || 0) / (c.act7 || 7)).toFixed(1)}</b>, 30d <b>{((k30.orders || 0) / (c.act30 || 30)).toFixed(1)}</b></div>
            <div className="edit">
              <label className="hot">Daily budget $<Input name={'b_' + c.id} hot /></label>
              <label className="hot">Top of search +%<Input name={'t_' + c.id} hot /></label>
              <label>Product pages +%<Input name={'p_' + c.id} /></label>
              <label>Rest of search +%<Input name={'r_' + c.id} /></label>
              <span className="bspent">Budget set <b>{money(c.budget)}</b> · spent <b>{money((k30.cost || 0) / (c.act30 || 30))}</b>/day over {c.act30} active days ({c.budget ? pct((100 * (k30.cost || 0)) / (c.act30 || 30) / c.budget) : '-'})</span>
            </div>
            {isTouched && (
              <div className="hypc"><label htmlFor={'hyp_' + c.id}><b>Why change {c.name}?</b> <span className="mut">One sentence: what you expect and which number will show it.</span></label>
                <textarea id={'hyp_' + c.id} value={hyps[c.id] ?? (hyps._prefill ? hyps._prefill + ': ' : '')} onChange={(e) => setHyps((h) => ({ ...h, [c.id]: e.target.value }))} placeholder="If we change this, then ... because ... We will know by watching ..." />
                <div className="row"><label className="small">Success looks like <select value={hyps['succ_' + c.id] || 'orders_up'} onChange={(e) => setHyps((h) => ({ ...h, ['succ_' + c.id]: e.target.value }))}>{SUCC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="small">Judge after <select value={hyps['days_' + c.id] || '14'} onChange={(e) => setHyps((h) => ({ ...h, ['days_' + c.id]: e.target.value }))}><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option></select></label></div>
                {missing.includes(c.id) && <div className="err">Write one sentence here first, then you can send.</div>}
              </div>)}
            {(c.keywords?.length || c.targets?.length) > 0 && (
              <details open={isTouched && changed.some(([k]) => k.startsWith('kw_') || k.startsWith('tg_'))}><summary>{(c.keywords?.length || 0) + (c.targets?.length || 0)} keywords and targets (bid $){sugg.length ? <> · <b>{sugg.length} suggestion{sugg.length === 1 ? '' : 's'}</b></> : null}</summary>
                <p className="mut small">Suggested bid = what a click is worth at your target ad cost (sales per click × target), kept inside a 25% step. Rank campaigns use their higher allowance. Hover a suggestion for the numbers.</p>
                {sugg.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setVals((s) => { const n = { ...s }; for (const x of sugg) n[x.keywordId ? 'kw_' + x.keywordId : 'tg_' + x.targetId] = x.suggest.toFixed(2); return n; })}>Fill {sugg.length} suggested bid{sugg.length === 1 ? '' : 's'}</button>}
                <div className="wrap"><table className="kw"><thead><tr><th>Target</th><th>Bid → suggested</th><th>Orders 30d</th><th>Spend 30d</th><th>Ad cost per $100</th></tr></thead><tbody>
                  {[...(c.keywords || []).map((k) => ({ ...k, field: 'kw_' + k.keywordId, label: <>{k.text} <span className="mut">[{k.match.toLowerCase()}]</span></> })), ...(c.targets || []).map((t) => ({ ...t, field: 'tg_' + t.targetId, label: t.text }))].map((x) => (
                    <tr key={x.field}><td>{x.label}</td><td><Input name={x.field} />{x.suggest != null ? <div className="small"><a href="#" className="sug" title={x.why} onClick={(e) => { e.preventDefault(); set(x.field, x.suggest.toFixed(2)); }}>→ ${x.suggest.toFixed(2)}</a></div> : x.why ? <div className="mut small" title={x.why}>{x.why.startsWith('already') ? 'no change' : 'not enough data'}</div> : null}</td><td>{x.orders}</td><td>{money(x.cost)}</td><td>{money(x.acos)}</td></tr>))}
                </tbody></table></div></details>)}
          </div>);
      })}
      <div className="bar"><span className="mut">{touched.length ? `${touched.length} campaign${touched.length > 1 ? 's' : ''} changing${missing.length ? ` - write one sentence under ${missing.length} of them` : ' - ready'}` : 'No changes yet'}</span>
        <button type="button" className="btn ghost" onClick={() => { setVals({}); setHyps({}); }}>Reset edits</button>
        <button type="button" className="btn cta" aria-disabled={!touched.length || missing.length > 0 || !d.can_send} onClick={review}>Review and send to Amazon</button></div>
      <Popup open={!!pop} title={pop?.title} label={pop?.label} preview={preview} progress={progress} result={result} onConfirm={confirm} onClose={close} />
    </>
  );
}
