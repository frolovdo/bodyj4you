import React, { useEffect, useMemo, useState } from 'react';
import { api } from './App.jsx';
import Popup from './Popup.jsx';

// Search terms: word patterns wasting money across many searches (blocked as negative phrase), and brand searches leaking into
// non-brand campaigns. Data: the engine's searchterms_model (adsops/ac_ngrams.py). Sending: the same preview/send path as Keywords.
const money = (v, d = 2) => (v == null || isNaN(v) ? '-' : '$' + Number(v).toFixed(d));
const SUCC = [['acos_down', 'lower ad cost per $100'], ['orders_up', 'more orders/day'], ['spend_up_acos_ok', 'more spend at acceptable ad cost']];
const norm = (s) => String(s || '').trim().toLowerCase();
const short = (n) => String(n || '').replace(' - AI', '');

function csv(rows) {
  const head = ['pattern', 'status', 'protected', 'searches', 'clicks', 'spend', 'orders', 'acos_pct', 'bad_luck_pct', 'campaigns', 'examples'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')].concat(rows.map((o) => [o.gram, o.status, o.protected || '', o.terms, o.clicks, o.cost, o.orders, o.acos ?? '', o.luck,
    o.where.map((w) => short(w.campaignName)).join(' | '), o.examples.join(' | ')].map(q).join(',')));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `search-term-patterns-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(url);
}

export default function SearchTerms({ csrf }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState({});        // gram -> true
  const [bsel, setBsel] = useState({});      // brand leak key -> true
  const [showAll, setShowAll] = useState(false);
  const [hyps, setHyps] = useState({});
  const [pop, setPop] = useState(null); const [preview, setPreview] = useState(null); const [progress, setProgress] = useState(null); const [result, setResult] = useState(null); const [staged, setStaged] = useState(null);
  const load = () => api('searchterms').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load')));
  useEffect(() => { load(); }, []);
  const M = d?.model;
  const have = d?.have || { neg: {} };

  // an ad group already stops a pattern when it holds a phrase negative whose words sit inside the pattern
  const covered = (w, gram) => (have.neg[`${w.campaignId}|${w.adGroupId}`] || []).some((n) => n.phrase && (' ' + norm(gram) + ' ').includes(' ' + n.text + ' '));
  const rows = useMemo(() => (M?.ngrams || []).map((o) => ({ ...o, open: o.where.filter((w) => !covered(w, o.gram)) })), [M, have]);
  const blocks = rows.filter((o) => o.status === 'block' && !o.protected && o.open.length);
  const done = rows.filter((o) => o.status === 'block' && o.where.length && !o.open.length);
  const held = rows.filter((o) => o.status === 'block' && o.protected && o.open.length);
  const shown = showAll ? rows.filter((o) => o.open.length || o.status !== 'block') : blocks;
  const costly = rows.filter((o) => o.status === 'costly');
  const leak = M?.brand?.leak || [];
  const brandOk = !!M?.brand?.sp_brand_campaign;

  const touched = useMemo(() => {
    const m = {};
    for (const g of Object.keys(sel)) { const o = rows.find((x) => x.gram === g); for (const w of o?.open || []) m[w.campaignId] = w.campaignName; }
    for (const k of Object.keys(bsel)) { const y = leak.find((x) => `${x.campaignId}|${x.term}` === k); if (y) m[y.campaignId] = y.campaignName; }
    return m;
  }, [sel, bsel, rows]);
  const ids = Object.keys(touched);
  const missing = ids.filter((cid) => (hyps[cid] || '').trim().length < 10);
  const nRows = Object.keys(sel).reduce((s, g) => s + (rows.find((x) => x.gram === g)?.open.length || 0), 0) + Object.keys(bsel).length;
  const saving = Object.keys(sel).reduce((s, g) => s + (rows.find((x) => x.gram === g)?.cost || 0), 0);

  const form = () => {
    const f = { csrf };
    let i = 0;
    for (const g of Object.keys(sel)) {
      const o = rows.find((x) => x.gram === g);
      for (const w of o?.open || []) f['kneg_p' + i++] = JSON.stringify({ campaignId: w.campaignId, adGroupId: w.adGroupId, campaignName: w.campaignName, keywordText: g, matchType: 'NEGATIVE_PHRASE' });
    }
    for (const k of Object.keys(bsel)) {
      const y = leak.find((x) => `${x.campaignId}|${x.term}` === k);
      if (y) f['kneg_b' + i++] = JSON.stringify({ campaignId: y.campaignId, adGroupId: y.adGroupId, campaignName: y.campaignName, keywordText: y.term });
    }
    for (const cid of ids) { f['hyp_' + cid] = hyps[cid] || ''; f['succ_' + cid] = hyps['succ_' + cid] || 'acos_down'; f['days_' + cid] = hyps['days_' + cid] || '14'; }
    return f;
  };
  const post = (path, b) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const review = async () => { if (!nRows || missing.length) { const el = document.getElementById('hyp_' + missing[0]); el?.scrollIntoView({ block: 'center' }); el?.focus(); return; } setPop({ title: 'Block these word patterns on Amazon?', label: 'Yes, send now' }); setPreview(null); setProgress(null); setResult(null); setPreview(await post('preview', form())); };
  const confirm = async () => {
    const steps = [{ label: 'Backup and record', state: 'run' }, { label: 'Send to Amazon', state: '' }, { label: 'Read back and verify', state: '' }]; setProgress([...steps]);
    const s1 = await post('send', { ...form(), step: 'stage' }); if (!s1.ok) { setResult({ ok: false, text: s1.error || 'could not stage' }); return; }
    setStaged(s1.id); steps[0] = { ...steps[0], state: 'done', note: s1.id }; steps[1].state = 'run'; setProgress([...steps]);
    const s2 = await post('send', { csrf, step: 'execute', id: s1.id }); steps[1] = { ...steps[1], state: s2.ok ? 'done' : 'fail', note: `${s2.sent || 0} sent${s2.failed ? `, ${s2.failed} failed` : ''}` }; steps[2].state = 'run'; setProgress([...steps]);
    const s3 = await post('send', { csrf, step: 'verify', id: s1.id }); steps[2] = { ...steps[2], state: s3.ok ? 'done' : 'fail' }; setProgress([...steps]);
    setResult({ ok: s2.ok && s3.ok, sentAny: (s2.sent || 0) > 0, text: `${s1.title}: ${s2.summary || `${s2.sent || 0} sent, ${s2.failed || 0} failed`}.`, diffs: s3.diffs, skipped: s2.skipped, errors: s2.errors });
    setSel({}); setBsel({}); setHyps({}); load();
  };
  const close = async () => { if (staged && !result) await post('send', { csrf, step: 'cancel', id: staged }); setPop(null); setStaged(null); };

  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  if (!M) return <div className="card"><b>No search-term data yet.</b> The engine has not pushed the search terms model. It is built by <code>adsops/ac_ngrams.py</code> and pushed with the nightly model (<code>ac_push_supabase.py model</code>) once that change is merged in the engine repo.</div>;
  const B = M.basis, T = M.totals;
  return (
    <>
      <p className="small"><a href="#patterns">Word patterns</a> · <a href="#costly">Costly patterns</a> · <a href="#brand">Brand leak</a> · <span className="mut">searches {M.window.start} to {M.window.end}, judged on clicks through {M.window.matured_through} (orders still arrive for newer days)</span></p>
      <div className="tiles">
        <div className="tile"><span className="tl">Safe to block</span><b>{blocks.length}</b><span className="tv">{money(blocks.reduce((s, o) => s + o.cost, 0))} spent, 0 orders{held.length ? ` · ${held.length} held back` : ''}</span></div>
        <div className="tile"><span className="tl">Costly patterns</span><b>{costly.length}</b><span className="tv">orders, but ad cost over 2× target</span></div>
        <div className="tile"><span className="tl">Brand leak</span><b>{money(T.brand_leak_spend)}</b><span className="tv">{leak.length} brand searches in non-brand campaigns</span></div>
        <div className="tile"><span className="tl">All search terms</span><b>{T.terms}</b><span className="tv">{money(T.spend, 0)} spend in 30 days</span></div>
      </div>

      <h2 id="patterns">Word patterns wasting money</h2>
      <div className="card">
        <p><b>Why patterns:</b> one search rarely gets enough clicks to judge, so most single terms stay on the watch list. The same wasted word, though, often hides inside many different searches; added together they do have enough clicks. <b>What a block does:</b> a negative phrase on the pattern, in each ad group where it spent, stops every search containing those words, now and in future searches nobody has typed yet. <b>The line:</b> the family converts {B.cvr}% of clicks, so a pattern needs about {B.clicks_for_safe} clicks with no order before the chance it is just bad luck drops under {B.safe_luck}%.</p>
        {blocks.length ? <div className="note" style={{ borderLeft: '4px solid var(--good)' }}><b>{blocks.length} pattern{blocks.length === 1 ? '' : 's'} safe to block</b>, {money(blocks.reduce((s, o) => s + o.cost, 0))} spent in 30 days with no order.{done.length ? <span className="mut"> {done.length} more already blocked on Amazon.</span> : null}</div>
          : <div className="note" style={{ borderLeft: '4px solid var(--warn)' }}><b>No pattern is safe to block right now.</b> The list below is a watch list.</div>}
        {held.length > 0 && <p className="small"><b>{held.length} more wasted pattern{held.length === 1 ? ' is' : 's are'} held back</b> ({money(held.reduce((s, o) => s + o.cost, 0))}): blocking {held.length === 1 ? 'it' : 'them'} as a phrase would also stop rosehip or brand searches, or {held.length === 1 ? 'it describes' : 'they describe'} our own product. Show them to decide one by one; they can be ticked there.</p>}
        <p className="small">
          <a href="#patterns" onClick={(e) => { e.preventDefault(); setShowAll(!showAll); }}>{showAll ? 'Show safe ones only' : 'Show the watch list and protected words'}</a>
          {' · '}<a href="#patterns" onClick={(e) => { e.preventDefault(); csv(rows); }}>Download all patterns as CSV</a>
          {have.error && <span className="warn"> · could not read Amazon just now; the send step checks again</span>}
        </p>
        <div style={{ overflowX: 'auto' }}><table className="kw"><thead><tr><th>Block</th><th>Pattern</th><th>Searches</th><th>Clicks</th><th>Spend</th><th>Orders</th><th>Chance it is bad luck</th><th>Stopped in</th></tr></thead><tbody>
          {shown.map((o) => {
            const can = o.status === 'block' && o.open.length > 0 && (!o.protected || showAll);
            return (<tr key={o.gram}>
              <td><input type="checkbox" disabled={!can} checked={!!sel[o.gram]} aria-label={'block ' + o.gram} onChange={(e) => setSel((s) => { const n2 = { ...s }; if (e.target.checked) n2[o.gram] = true; else delete n2[o.gram]; return n2; })} /></td>
              <td><b>{o.gram}</b>{o.protected ? <span className="pill" title="Blocking it may switch off searches we want. Tick only if you are sure."> {o.protected}</span> : null}{o.status !== 'block' ? <span className="pill"> {o.status === 'watch' ? (o.where.length ? 'watch' : 'exact keyword only: lower the bid instead') : o.status}</span> : null}
                <div className="small mut">{o.examples.slice(0, 4).join(' · ')}{o.terms > 4 ? ` · +${o.terms - 4} more` : ''}</div></td>
              <td>{o.terms}</td><td>{o.clicks}</td><td>{money(o.cost)}</td><td>{o.orders}</td><td>{o.status === 'costly' ? `ACoS ${Math.round(o.acos)}%` : Math.round(o.luck) + '%'}</td>
              <td className="small">{o.open.length ? o.open.map((w) => short(w.campaignName)).filter((v, i, a) => a.indexOf(v) === i).join(', ') : <span className="mut">{o.where.length ? 'already blocked' : '-'}</span>}</td>
            </tr>);
          })}
          {!shown.length && <tr><td colSpan={8} className="mut">Nothing to show.</td></tr>}
        </tbody></table></div>
      </div>

      <h2 id="costly">Costly patterns</h2>
      <div className="card">
        <p><b>These sell, but expensively:</b> ad cost above twice your {Math.round(B.target_acos)}% target on 10+ clicks. Blocking would also cut orders, so the move is a lower bid on the keyword or target that catches them, not a negative. Listed here so the weekly bid review looks at them.</p>
        <div style={{ overflowX: 'auto' }}><table className="kw"><thead><tr><th>Pattern</th><th>Searches</th><th>Clicks</th><th>Spend</th><th>Orders</th><th>Ad cost per $100</th></tr></thead><tbody>
          {costly.map((o) => (<tr key={o.gram}><td><b>{o.gram}</b><div className="small mut">{o.examples.slice(0, 3).join(' · ')}</div></td><td>{o.terms}</td><td>{o.clicks}</td><td>{money(o.cost)}</td><td>{o.orders}</td><td>{o.acos != null ? Math.round(o.acos) + '%' : '-'}</td></tr>))}
          {!costly.length && <tr><td colSpan={6} className="mut">None.</td></tr>}
        </tbody></table></div>
      </div>

      <h2 id="brand">Brand leak</h2>
      <div className="card">
        <p><b>What this is:</b> shoppers searching for our own brand ({M.brand.terms.slice(0, 2).join(', ')}) whose clicks were paid by a generic campaign. Brand searches are usually cheapest in a campaign of their own.</p>
        {!leak.length ? <div className="note" style={{ borderLeft: '4px solid var(--good)' }}><b>No brand searches in non-brand campaigns.</b></div>
          : brandOk ? <div className="note" style={{ borderLeft: '4px solid var(--warn)' }}><b>{money(T.brand_leak_spend)} of brand searches ran in generic campaigns.</b> Blocking them there (exact) sends them to the brand campaign.</div>
          : <div className="note" style={{ borderLeft: '4px solid var(--warn)' }}><b>Leave these running for now.</b> There is no product-ad brand campaign to catch them (the brand campaign is the banner), so blocking them here would drop them. They brought {money(T.brand_leak_sales)} in sales on {money(T.brand_leak_spend)}. A product-ad brand campaign is on the Roadmap.</div>}
        {leak.length > 0 && <div style={{ overflowX: 'auto' }}><table className="kw"><thead><tr><th>Block</th><th>Search</th><th>Campaign</th><th>Clicks</th><th>Spend</th><th>Orders</th><th>Ad cost per $100</th></tr></thead><tbody>
          {leak.map((y) => { const k = `${y.campaignId}|${y.term}`; return (<tr key={k}>
            <td><input type="checkbox" disabled={!brandOk || y.exact} checked={!!bsel[k]} aria-label={'block ' + y.term} onChange={(e) => setBsel((s) => { const n2 = { ...s }; if (e.target.checked) n2[k] = true; else delete n2[k]; return n2; })} /></td>
            <td>{y.term}</td><td>{short(y.campaignName)}</td><td>{y.clicks}</td><td>{money(y.cost)}</td><td>{y.orders}</td><td>{y.acos != null ? Math.round(y.acos) + '%' : '-'}</td></tr>); })}
        </tbody></table></div>}
      </div>

      {ids.length > 0 && (
        <div className="card hypc"><h3 style={{ margin: '0 0 4px' }}>Why make these changes?</h3><p className="mut small">One sentence per campaign: what you expect and which number will show it.</p>
          {ids.map((cid) => (<div key={cid} style={{ marginBottom: 8 }}><label htmlFor={'hyp_' + cid}><b>{touched[cid]}</b></label>
            <textarea id={'hyp_' + cid} value={hyps[cid] || ''} onChange={(e) => setHyps((h) => ({ ...h, [cid]: e.target.value }))} placeholder="Blocking these patterns should cut wasted spend without losing orders; we will see it in ad cost per $100." />
            <div className="row"><label className="small">Success looks like <select value={hyps['succ_' + cid] || 'acos_down'} onChange={(e) => setHyps((h) => ({ ...h, ['succ_' + cid]: e.target.value }))}>{SUCC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="small">Judge after <select value={hyps['days_' + cid] || '14'} onChange={(e) => setHyps((h) => ({ ...h, ['days_' + cid]: e.target.value }))}><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option></select></label></div></div>))}
        </div>)}
      <div className="bar"><span className="mut">{nRows ? `${nRows} negative${nRows > 1 ? 's' : ''} in ${ids.length} campaign${ids.length > 1 ? 's' : ''}, ${money(saving)} of 30-day waste${missing.length ? ` - write one sentence for ${missing.length} campaign${missing.length > 1 ? 's' : ''}` : ' - ready'}` : 'Nothing ticked yet'}</span>
        <button type="button" className="btn ghost" onClick={() => { setSel({}); setBsel({}); setHyps({}); }}>Clear</button>
        <button type="button" className="btn cta" aria-disabled={!nRows || missing.length > 0 || !d.can_send} onClick={review}>Review and send to Amazon</button></div>
      <Popup open={!!pop} title={pop?.title} label={pop?.label} preview={preview} progress={progress} result={result} onConfirm={confirm} onClose={close} />
    </>
  );
}
