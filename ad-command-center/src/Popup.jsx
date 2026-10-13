import React, { useEffect, useRef } from 'react';

// The confirm popup: preview (changes, hypotheses, checks, money moving), then the three send steps with progress, then the result.
export default function Popup({ open, title, preview, label, onConfirm, onClose, progress, result }) {
  const ref = useRef(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  const blocked = (preview?.checks || []).filter((c) => c.level === 'block');
  const warns = (preview?.checks || []).filter((c) => c.level === 'warn');
  const b = preview?.budget;
  return (
    <dialog ref={ref} className="popup" onClose={onClose}>
      <h3>{title}</h3>
      <div className="popbody">
        {!preview && !result && <p className="mut">Checking against the live account…</p>}
        {preview?.error && <p className="block">Cannot apply: {preview.error}</p>}
        {preview && !preview.error && !result && (
          <>
            <p className="money">{b && Math.abs(b[1] - b[0]) > 0.5 ? <b>Product-ad budget ${Math.round(b[0])} → ${Math.round(b[1])} a day ({b[1] > b[0] ? '+' : '−'}${Math.round(Math.abs(b[1] - b[0]))}). Goes live on Amazon now.</b> : <b>Goes live on Amazon now.</b>}</p>
            <p><b>{preview.changes.length} change{preview.changes.length === 1 ? '' : 's'} will be sent:</b></p>
            <ul>{preview.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            {Object.keys(preview.hyps || {}).length > 0 && <><p className="mut small"><b>Hypotheses saved as benchmarks:</b></p><ul className="small">{Object.entries(preview.hyps).map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}</ul></>}
            {warns.length > 0 && <><p className="warn">Heads up (recorded if you confirm):</p><ul>{warns.map((c, i) => <li key={i}>{c.detail}</li>)}</ul></>}
            {blocked.length > 0 ? <><p className="block">Blocked:</p><ul>{blocked.map((c, i) => <li key={i}>{c.detail}</li>)}</ul></> : <p className="ok">✓ A backup and an undo file are saved first, and Amazon is read back afterwards to confirm.</p>}
          </>
        )}
        {progress && !result && <ol className="steps">{progress.map((s, i) => <li key={i} className={s.state}>{s.label}{s.note ? <span className="mut small"> · {s.note}</span> : ''}</li>)}</ol>}
        {result && (
          <div className={'result ' + (result.ok ? 'good' : 'bad')}>
            <h4>{result.ok ? 'Sent to Amazon and verified' : result.sentAny ? 'Sent, but check the result' : 'Not sent'}</h4>
            <p>{result.text}</p>
            {result.diffs?.length > 0 && <ul>{result.diffs.map((d, i) => <li key={i}>{d}</li>)}</ul>}
            {result.errors?.length > 0 && <ul>{result.errors.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          </div>
        )}
      </div>
      <div className="popbtns">
        <button type="button" className="btn alt" onClick={onClose} autoFocus>{result ? 'Close' : 'Cancel'}</button>
        {preview && !preview.error && !blocked.length && !progress && !result && <button type="button" className="btn go" onClick={onConfirm}>{label}</button>}
      </div>
    </dialog>
  );
}
