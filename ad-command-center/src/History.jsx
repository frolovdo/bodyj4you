import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';
import Popup from './Popup.jsx';

const money = (v) => (v == null || isNaN(v) ? '-' : '$' + Math.round(v));

export default function History({ csrf }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [pop, setPop] = useState(null);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [pulse, setPulse] = useState({});
  const load = () => api('history').then((r) => (r.ok ? setD(r) : setError(r.error || 'could not load')));
  useEffect(() => { load(); api('review').then((r) => { if (!r.ok) return; const m = {}; for (const it of r.items || []) for (const e of it.entries) m[(it.id || '') + '|' + e.campaign] = e; setPulse(m); }); }, []);
  const post = (path, b) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

  const restore = async (since) => {
    setPop({ since, title: `Put settings back to before ${since}?`, label: 'Yes, restore now' }); setPreview(null); setProgress(null); setResult(null);
    setPreview(await post('preview', { csrf, since }));
  };
  const confirm = async () => {
    const steps = [{ label: 'Backup and record', state: 'run' }, { label: 'Send to Amazon', state: '' }, { label: 'Read back and verify', state: '' }];
    setProgress([...steps]);
    const s1 = await post('send', { csrf, since: pop.since, step: 'stage' });
    if (!s1.ok) { setResult({ ok: false, text: s1.error || 'could not stage' }); return; }
    steps[0] = { ...steps[0], state: 'done', note: s1.id }; steps[1].state = 'run'; setProgress([...steps]);
    const s2 = await post('send', { csrf, step: 'execute', id: s1.id });
    steps[1] = { ...steps[1], state: s2.ok ? 'done' : 'fail', note: `${s2.sent || 0} sent${s2.failed ? `, ${s2.failed} failed` : ''}` }; steps[2].state = 'run'; setProgress([...steps]);
    const s3 = await post('send', { csrf, step: 'verify', id: s1.id });
    steps[2] = { ...steps[2], state: s3.ok ? 'done' : 'fail' }; setProgress([...steps]);
    setResult({ ok: s2.ok && s3.ok, sentAny: (s2.sent || 0) > 0, text: `${s1.title}: ${s2.summary || `${s2.sent || 0} sent, ${s2.failed || 0} failed`}.`, diffs: s3.diffs, skipped: s2.skipped, errors: s2.errors });
    load();
  };

  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  return (
    <>
      <h2 style={{ marginTop: 0 }}>History</h2>
      <p className="mut small">Every change sent to Amazon, who made it, and a button to put settings back to how they were before it. The button shows exactly what will change and asks you to confirm.</p>
      <div className="card"><div className="wrap"><table className="kt"><thead><tr><th>Sent (PT)</th><th>By</th><th>What</th><th>Why / hypothesis</th><th>Undo</th></tr></thead><tbody>
        {d.batches.map((b, i) => (
          <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{b.time}</td><td>{b.who}</td>
            <td><b>{b.ok} change{b.ok === 1 ? '' : 's'}</b> in {b.camps.length} campaign{b.camps.length === 1 ? '' : 's'}{b.already ? <span className="mut"> ({b.already} already on Amazon, nothing to do)</span> : null}{b.err ? <span className="block"> ({b.err} failed)</span> : null}
              <details><summary>{b.camps.join(', ').slice(0, 90) || (b.already && !b.ok ? 'nothing changed: a repeat of an earlier send' : 'details')}</summary>
                <ul className="small">{b.changes.slice(0, 30).map((c, j) => <li key={j}>{c}</li>)}
                  {(b.failed || []).map((c, j) => <li key={'f' + j} className="block">failed: {c}</li>)}
                  {(b.alreadyRows || []).map((c, j) => <li key={'a' + j} className="mut">{c}</li>)}</ul></details></td>
            <td className="small">{b.why}</td>
            <td>{b.restorable && d.can_send ? <button className="btn alt sm" onClick={() => restore(b.time)}>Restore to before {b.time.slice(5)}</button> : <span className="mut small">{b.restorable ? '' : b.ok ? "can't be undone" : 'nothing to undo'}</span>}</td></tr>))}
      </tbody></table></div></div>
      <h2>Hypotheses and benchmarks</h2>
      <div className="card"><div className="wrap"><table className="kt"><thead><tr><th>Saved</th><th>By</th><th>Campaign</th><th>Hypothesis</th><th>Benchmark then</th><th>Verdict now</th></tr></thead><tbody>
        {d.hypotheses.map((h) => (
          <tr key={h.id}><td style={{ whiteSpace: 'nowrap' }}>{(h.at || '').slice(0, 10)}</td><td>{h.by_user}</td><td>{h.campaign}</td>
            <td>{h.hypothesis}<div className="mut small">success = {(h.success || '').replace(/_/g, ' ')}, judge {h.review_on || '-'}</div></td>
            <td className="small">orders/day {h.baseline?.orders_day_7d?.toFixed?.(1) ?? h.baseline?.orders_day_7d}, ad cost per $100 {money(h.baseline?.acos_7d)}, budget {money(h.baseline?.budget)}</td>
            <td><b className={h.label === 'worked' ? 'good' : h.label === 'did not' ? 'bad' : 'mut'}>{h.label}</b><div className="small">{h.detail}</div>
              {pulse[(h.item_id || '') + '|' + h.campaign] && <details><summary>pulse: {pulse[(h.item_id || '') + '|' + h.campaign].status}</summary><div className="small" style={{ maxWidth: '60ch' }}>{pulse[(h.item_id || '') + '|' + h.campaign].sentences.join(' ')}</div></details>}</td></tr>))}
      </tbody></table></div></div>
      <Popup open={!!pop} title={pop?.title} label={pop?.label} preview={preview} progress={progress} result={result} onConfirm={confirm} onClose={() => setPop(null)} />
    </>
  );
}
