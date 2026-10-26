import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';
import { Move } from './Update.jsx';

// "Whole account" in the family menu: the daily ads brief for all families, each finding with a button into the campaign's
// own Update page, then one line per family. Numbers come from the same datasets the family pages use.
const money = (v, d = 0) => (v == null || isNaN(v) ? '-' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(d) + '%');
const TONE = { bad: ['Act', 'bad'], info: ['Watch', 'mut'], good: ['Good', 'good'] };
const PT = (iso, o = {}) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit', ...o }) : '');

// Switch the whole app to a family and open its Update page, scrolled to one campaign when given.
export const go = (fam, cid) => { try { localStorage.setItem('ac_family', fam); } catch {} location.hash = '#/update' + (cid ? '?focus=' + cid : ''); location.reload(); };

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
  const b = d.brief;
  const fmt = (k, v) => (k === 'ord_d' ? Number(v).toFixed(0) : k === 'cpc' ? money(v, 2) : k === 'acos' ? money(v) : pct(v));
  const Cell = ({ five, k }) => {
    const t = (five || []).find((x) => x.key === k);
    if (!t || t.v7 == null) return <td className="mut">-</td>;
    return <td><b>{fmt(k, t.v7)}</b> {t.v30 != null && <span className="small"><Move now={t.v7} ref_={t.v30} up={t.up} /></span>}</td>;
  };
  return (
    <>
      <h2 style={{ margin: '4px 0 8px' }}>Daily ads brief, all families</h2>
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
