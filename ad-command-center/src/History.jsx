import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';
import Popup from './Popup.jsx';

const money = (v) => (v == null || isNaN(v) ? '-' : '$' + Math.round(v));

// Change log: every change on this family's campaigns, day by day (newest day open), from Amazon's own history, with who made it.
function ChangeLog({ log }) {
  const [camp, setCamp] = useState('');
  const [who, setWho] = useState('');
  if (!log) return <div className="card"><p className="mut">The change log has not been built for this family yet. It is rebuilt every morning on the Mac.</p></div>;
  const whos = [...new Set(log.days.flatMap((d) => d.groups.map((g) => g.who)))].sort();
  const days = log.days.map((d) => ({ ...d, groups: d.groups.filter((g) => (!camp || g.cid === camp) && (!who || g.who === who)) })).filter((d) => d.groups.length);
  return (
    <div className="card">
      <div className="cl-bar">
        <select value={camp} onChange={(e) => setCamp(e.target.value)}><option value="">All {log.campaigns.length} campaigns</option>{log.campaigns.map((c) => <option key={c.cid} value={c.cid}>{c.name}</option>)}</select>
        <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Anyone</option>{whos.map((w) => <option key={w}>{w}</option>)}</select>
        <span className="mut small">Last {log.days_back} days · updated {log.as_of.slice(0, 16).replace('T', ' ')} PT</span>
      </div>
      {!days.length && <p className="mut">No changes match.</p>}
      {days.map((d, i) => (
        <details key={d.day} className="cl-day" open={i === 0}>
          <summary><b>{d.day}</b> <span className="mut small">{d.groups.length} change{d.groups.length === 1 ? '' : 's'} · {[...new Set(d.groups.map((g) => g.campaign))].length} campaign{[...new Set(d.groups.map((g) => g.campaign))].length === 1 ? '' : 's'}</span></summary>
          <table className="kt cl-t"><tbody>
            {d.groups.map((g, j) => (
              <tr key={j}><td className="mut" style={{ whiteSpace: 'nowrap' }}>{g.t}</td><td>{g.campaign}</td>
                <td><b>{g.what}</b>{g.items?.length ? <details><summary className="small mut">{g.items.length} item{g.items.length === 1 ? '' : 's'}</summary><ul className="small">{g.items.map((x, k) => <li key={k}>{x}</li>)}</ul></details> : null}
                  {g.why && <div className="small mut">{g.why}</div>}</td>
                <td className={'small ' + (g.who.startsWith('Amazon console') ? 'cl-ext' : '')}>{g.who}</td></tr>))}
          </tbody></table>
        </details>
      ))}
    </div>
  );
}

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
      <h2>Change log: every change on these campaigns</h2>
      <p className="mut small">From Amazon's own change history, refreshed every morning: changes made in the Amazon console, by other tools, by Amazon's budget rules, by the robots and from here. Each one is matched to our send records to say who made it.</p>
      <ChangeLog log={d.changelog} />
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
