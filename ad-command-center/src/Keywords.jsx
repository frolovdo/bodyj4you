import React, { useEffect, useMemo, useState } from 'react';
import { api } from './App.jsx';
import Popup from './Popup.jsx';

const money = (v, d = 0) => (v == null || isNaN(v) ? '-' : '$' + Number(v).toFixed(d));
const SUCC = [['orders_up', 'more orders/day'], ['acos_down', 'lower ad cost per $100'], ['spend_up_acos_ok', 'more spend at acceptable ad cost'], ['rank_up', 'better organic rank']];

export default function Keywords({ csrf }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [adds, setAdds] = useState({});   // key -> {dest, bid, neg}
  const [negs, setNegs] = useState({});   // key -> true
  const [allAdv, setAllAdv] = useState(false);
  const [allNeg, setAllNeg] = useState(false);
  const [hyps, setHyps] = useState({});
  const [pop, setPop] = useState(null); const [preview, setPreview] = useState(null); const [progress, setProgress] = useState(null); const [result, setResult] = useState(null); const [staged, setStaged] = useState(null);
  useEffect(() => { api('keywords').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load'))); }, []);
  const M = d?.model;
  const advTop = useMemo(() => (M?.advertise || []).filter((c) => c.ok && c.clicks >= 3).sort((a, b) => b.orders - a.orders), [M]);
  const negSafe = useMemo(() => (M?.negatives || []).filter((c) => c.luck <= 20 && !c.core).sort((a, b) => b.cost - a.cost), [M]);
  const advList = allAdv ? (M?.advertise || []) : advTop.slice(0, 5);
  const negList = allNeg ? (M?.negatives || []).filter((c) => !c.core) : negSafe.slice(0, 5);
  const dests = M?.destinations || [];
  // campaigns touched: destination campaigns of adds, source campaigns of block-in-source, campaigns of negatives
  const touched = useMemo(() => {
    const m = {};
    for (const [k, a] of Object.entries(adds)) { const c = (M?.advertise || []).find((x) => x.key === k); if (!c) continue; const dst = dests.find((x) => x.cid === (a.dest || c.default)); if (dst) m[dst.cid] = dst.name; if (a.neg && c.campaignId !== (a.dest || c.default)) m[c.campaignId] = c.campaignName; }
    for (const k of Object.keys(negs)) { const c = (M?.negatives || []).find((x) => x.key === k); if (c) m[c.campaignId] = c.campaignName; }
    return m;
  }, [adds, negs, M]);
  const ids = Object.keys(touched);
  const missing = ids.filter((cid) => (hyps[cid] || '').trim().length < 10);
  const n = Object.keys(adds).length + Object.keys(negs).length;

  const form = () => {
    const f = { csrf };
    let i = 0;
    for (const [k, a] of Object.entries(adds)) { const c = M.advertise.find((x) => x.key === k); const dst = dests.find((x) => x.cid === (a.dest || c.default)); if (!dst) continue;
      f['kadd_' + i] = JSON.stringify({ campaignId: dst.cid, adGroupId: dst.ag, campaignName: dst.name, keywordText: c.term, bid: a.bid || c.bid });
      if (a.neg && c.campaignId !== dst.cid) f['kneg_s' + i] = JSON.stringify({ campaignId: c.campaignId, adGroupId: c.adGroupId, campaignName: c.campaignName, keywordText: c.term }); i++; }
    for (const k of Object.keys(negs)) { const c = M.negatives.find((x) => x.key === k); f['kneg_' + i] = JSON.stringify({ campaignId: c.campaignId, adGroupId: c.adGroupId, campaignName: c.campaignName, keywordText: c.term }); i++; }
    for (const cid of ids) { f['hyp_' + cid] = hyps[cid] || ''; f['succ_' + cid] = hyps['succ_' + cid] || 'orders_up'; f['days_' + cid] = hyps['days_' + cid] || '14'; }
    return f;
  };
  const post = (path, b) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const review = async () => { if (!n || missing.length) { const el = document.getElementById('hyp_' + missing[0]); el?.scrollIntoView({ block: 'center' }); el?.focus(); return; } setPop({ title: 'Send these keyword changes to Amazon?', label: 'Yes, send now' }); setPreview(null); setProgress(null); setResult(null); setPreview(await post('preview', form())); };
  const confirm = async () => {
    const steps = [{ label: 'Backup and record', state: 'run' }, { label: 'Send to Amazon', state: '' }, { label: 'Read back and verify', state: '' }]; setProgress([...steps]);
    const s1 = await post('send', { ...form(), step: 'stage' }); if (!s1.ok) { setResult({ ok: false, text: s1.error || 'could not stage' }); return; }
    setStaged(s1.id); steps[0] = { ...steps[0], state: 'done', note: s1.id }; steps[1].state = 'run'; setProgress([...steps]);
    const s2 = await post('send', { csrf, step: 'execute', id: s1.id }); steps[1] = { ...steps[1], state: s2.ok ? 'done' : 'fail', note: `${s2.sent || 0} sent${s2.failed ? `, ${s2.failed} failed` : ''}` }; steps[2].state = 'run'; setProgress([...steps]);
    const s3 = await post('send', { csrf, step: 'verify', id: s1.id }); steps[2] = { ...steps[2], state: s3.ok ? 'done' : 'fail' }; setProgress([...steps]);
    setResult({ ok: s2.ok && s3.ok, sentAny: (s2.sent || 0) > 0, text: `${s1.title}: ${s2.sent || 0} sent, ${s2.failed || 0} failed.`, diffs: s3.diffs, errors: s2.errors });
    setAdds({}); setNegs({}); setHyps({}); api('keywords').then((r) => r.ok && setD(r));
  };
  const close = async () => { if (staged && !result) await post('send', { csrf, step: 'cancel', id: staged }); setPop(null); setStaged(null); };

  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  if (!M) return <div className="card">No keyword data yet: the engine has not pushed the keywords model.</div>;
  return (
    <>
      <p className="small"><a href="#adv">Keywords to advertise</a> · <a href="#neg">Negative keywords</a> · <span className="mut">numbers through {d.produced_at?.slice(0, 10)}</span></p>
      <h2 id="adv" style={{ marginTop: 0 }}>Keywords to advertise</h2>
      <div className="card">
        <p><b>Why these:</b> shoppers typed these exact words and bought, but we only reached them by accident through broad, auto or deal campaigns. <b>Why add them as exact keywords:</b> you set the bid for that exact phrase yourself, Amazon learns that your listing belongs to it (which helps organic rank), and the spend stops depending on how the auto campaign feels that day. <b>Block in source</b> stops the old campaign bidding on the same word, so you do not pay twice.</p>
        <p className="small"><b>The five that matter most</b> (most orders first, at or under your target ad cost of {Math.round(M.tgt)}%). <a href="#adv" onClick={(e) => { e.preventDefault(); setAllAdv(!allAdv); }}>{allAdv ? 'Show the top 5 only' : `Show all ${M.advertise.length}`}</a></p>
        <div className="wrap"><table className="kw"><thead><tr><th>Add</th><th>Search term</th><th>Found in</th><th>Orders, 30d</th><th>Clicks</th><th>Ad cost per $100</th><th>Bid $</th><th>Add to</th><th></th></tr></thead><tbody>
          {advList.map((c) => { const a = adds[c.key]; const dst = a?.dest || c.default; const srcNeg = c.campaignId !== dst; return (
            <tr key={c.key}><td><input type="checkbox" checked={!!a} onChange={(e) => setAdds((s) => { const n2 = { ...s }; if (e.target.checked) n2[c.key] = { dest: c.default, bid: c.bid, neg: srcNeg }; else delete n2[c.key]; return n2; })} /></td>
              <td><b>{c.term}</b>{c.other ? <span className="pill"> already {c.other}</span> : null}</td><td>{c.campaignName.replace(' - AI', '')}</td><td>{c.orders}</td><td>{c.clicks}</td><td>{c.acos != null ? Math.round(c.acos) + '%' : '-'}</td>
              <td><input style={{ width: 70, minHeight: 36, fontSize: 15 }} value={a?.bid ?? c.bid.toFixed(2)} onChange={(e) => setAdds((s) => ({ ...s, [c.key]: { ...(s[c.key] || { dest: c.default, neg: srcNeg }), bid: e.target.value } }))} inputMode="decimal" /></td>
              <td><select style={{ minHeight: 36 }} value={dst} onChange={(e) => setAdds((s) => ({ ...s, [c.key]: { ...(s[c.key] || { bid: c.bid }), dest: e.target.value, neg: c.campaignId !== e.target.value } }))}>{dests.map((x) => <option key={x.cid} value={x.cid}>{x.name.replace(' - AI', '')}</option>)}</select></td>
              <td><label className="small"><input type="checkbox" disabled={!srcNeg} checked={!!a?.neg && srcNeg} onChange={(e) => setAdds((s) => ({ ...s, [c.key]: { ...(s[c.key] || { dest: c.default, bid: c.bid }), neg: e.target.checked } }))} /> block in source</label></td></tr>); })}
        </tbody></table></div>
      </div>
      <h2 id="neg">Negative keywords</h2>
      <div className="card">
        <p><b>Why block a word:</b> every click on it costs money and none of them bought, so the same dollars buy more orders on words that do convert. <b>What a block does:</b> only that exact search stops showing your ad; close variants still run. <b>The risk:</b> with few clicks, zero orders can be plain bad luck, so the last column says how likely that is; under 20% is safe to block. Words containing 'rosehip' are left out because blocking them can cost rank on your own category.</p>
        {negSafe.length ? <div className="note" style={{ borderLeft: '4px solid var(--good)' }}><b>{negSafe.length} term{negSafe.length === 1 ? '' : 's'} safe to block.</b></div>
          : <div className="note" style={{ borderLeft: '4px solid var(--warn)' }}><b>No search term is safe to block right now.</b> Campaigns here convert about 1 click in 4, so a term needs roughly 7 or more clicks with no order before zero orders stops being plausible luck. The list below is a watch list.</div>}
        <p className="small"><a href="#neg" onClick={(e) => { e.preventDefault(); setAllNeg(!allNeg); }}>{allNeg ? 'Show safe ones only' : 'Show the watch list'}</a></p>
        <div className="wrap"><table className="kw"><thead><tr><th>Block</th><th>Search term</th><th>Campaign</th><th>Clicks</th><th>Spend</th><th>Chance it is just bad luck</th></tr></thead><tbody>
          {negList.map((c) => (<tr key={c.key}><td><input type="checkbox" checked={!!negs[c.key]} onChange={(e) => setNegs((s) => { const n2 = { ...s }; if (e.target.checked) n2[c.key] = true; else delete n2[c.key]; return n2; })} /></td>
            <td>{c.term}{c.elsewhere ? <span className="pill"> orders elsewhere</span> : null}</td><td>{c.campaignName.replace(' - AI', '')}</td><td>{c.clicks}</td><td>{money(c.cost, 2)}</td><td>{Math.round(c.luck)}%</td></tr>))}
          {!negList.length && <tr><td colSpan={6} className="mut">Nothing to show.</td></tr>}
        </tbody></table></div>
      </div>
      {ids.length > 0 && (
        <div className="card hypc"><h3 style={{ margin: '0 0 4px' }}>Why make these changes?</h3><p className="mut small">One sentence per campaign: what you expect and which number will show it.</p>
          {ids.map((cid) => (<div key={cid} style={{ marginBottom: 8 }}><label htmlFor={'hyp_' + cid}><b>{touched[cid]}</b></label>
            <textarea id={'hyp_' + cid} value={hyps[cid] || ''} onChange={(e) => setHyps((h) => ({ ...h, [cid]: e.target.value }))} placeholder="If we do this, then ... We will know by watching ..." />
            <div className="row"><label className="small">Success looks like <select value={hyps['succ_' + cid] || 'orders_up'} onChange={(e) => setHyps((h) => ({ ...h, ['succ_' + cid]: e.target.value }))}>{SUCC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="small">Judge after <select value={hyps['days_' + cid] || '14'} onChange={(e) => setHyps((h) => ({ ...h, ['days_' + cid]: e.target.value }))}><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option></select></label></div></div>))}
        </div>)}
      <div className="bar"><span className="mut">{n ? `${n} change${n > 1 ? 's' : ''}${missing.length ? ` - write one sentence for ${missing.length} campaign${missing.length > 1 ? 's' : ''}` : ' - ready'}` : 'Nothing ticked yet'}</span>
        <button type="button" className="btn ghost" onClick={() => { setAdds({}); setNegs({}); setHyps({}); }}>Clear</button>
        <button type="button" className="btn cta" aria-disabled={!n || missing.length > 0 || !d.can_send} onClick={review}>Review and send to Amazon</button></div>
      <Popup open={!!pop} title={pop?.title} label={pop?.label} preview={preview} progress={progress} result={result} onConfirm={confirm} onClose={close} />
    </>
  );
}
