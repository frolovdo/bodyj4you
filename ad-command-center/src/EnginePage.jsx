import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';
import Now from './Now.jsx';

// Each page is produced by the engine and pushed to Supabase; this shows it with its age. The Dashboard gets the live block on top
// (alarms, yesterday, today so far, hypothesis pulse) read straight from Amazon and the hourly feed.
const SOON = {
  update: 'Update campaigns moves online in phase 1 (live settings, preview, send with backup and read-back, restore). Until then it runs on the Mac.',
  hourly: 'Hourly moves online in phase 2 with the schedule runner as a scheduled function.',
  keywords: 'Keywords moves online in phase 2.',
  history: 'History moves online in phase 1 together with the send path.',
};

export default function EnginePage({ name, csrf, user }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [eng, setEng] = useState({ runs: [] });   // from /api/refresh: runs, last_full_minutes, unknown
  const [msg, setMsg] = useState('');             // one sentence about the last action taken on this page
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState(0);      // time a start was requested but the run is not listed yet
  const loadPage = () => api('page?name=' + name).then((r) => { if (r.ok) setD(r); else setError(r.error || 'could not load'); });
  const loadRuns = () => api('refresh').then((r) => { if (r.ok) setEng(r); return r; });
  useEffect(() => { loadPage(); if (name === 'dashboard') loadRuns(); }, [name]);
  const runs = eng.runs || [];
  const running = runs.find((r) => r.status !== 'completed');
  const fmtMin = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  // While a run is going, ask every 30 s; when it ends, say how it ended and reload the page it produced.
  useEffect(() => {
    if (name !== 'dashboard' || !running) return undefined;
    const t = setInterval(async () => {
      const r = await loadRuns();
      if (!r || !r.ok || r.unknown) return;
      const still = (r.runs || []).find((x) => x.status !== 'completed');
      if (still) return;
      const last = (r.runs || [])[0];
      if (last && last.conclusion === 'success') { setMsg('Refresh finished. The pages below now show the new data.'); loadPage(); }
      else setMsg('The refresh did not finish. The pages still show the earlier data. You can press Refresh daily data to try again.');
    }, 30000);
    return () => clearInterval(t);
  }, [name, !!running]);
  // After a start, GitHub lists the new run 5 to 20 s later: look again at 8, 20 and 45 s; give up after 2 minutes.
  useEffect(() => {
    if (!pending) return undefined;
    const ts = [8000, 20000, 45000].map((ms) => setTimeout(async () => { const r = await loadRuns(); if (r && r.ok && (r.runs || []).find((x) => x.status !== 'completed')) setPending(0); }, ms));
    const giveUp = setTimeout(() => { setPending(0); setMsg('Uncertain whether the refresh started. Reload this page in a minute to check.'); }, 120000);
    return () => { ts.forEach(clearTimeout); clearTimeout(giveUp); };
  }, [pending]);
  const refresh = async () => {
    setStarting(true); setMsg('Asking the engine to start…');
    const r = await api('refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf, what: 'all' }) });
    setStarting(false); setMsg(r.ok ? r.msg : r.error);
    if (r.ok && r.runs) setEng(r);
    if (r.ok && r.started) setPending(Date.now());
  };
  // Exactly one status sentence under the buttons: what is happening now, or how the last run ended.
  const last = runs.find((r) => r.status === 'completed');
  const status = eng.unknown ? 'Could not check the refresh status.'
    : running ? (running.status === 'in_progress' ? `A refresh is running (started ${running.when}, ${running.kind}${running.minutes ? `, ${fmtMin(running.minutes)} so far` : ''}). The pages update by themselves when it finishes.` : `A refresh is waiting to start${running.minutes > 10 ? ' and is taking longer than usual (uncertain why)' : ''}. The pages update by themselves when it finishes.`)
    : pending ? 'A refresh is waiting to start. The pages update by themselves when it finishes.'
    : last ? (last.conclusion === 'success' ? `Last refresh finished ${last.when} (${last.kind}), took ${fmtMin(last.minutes)}.` : `The last refresh (${last.kind}, started ${last.when}) did not finish. The pages still show earlier data; press Refresh daily data to try again.`)
    : '';
  const waiting = !!running || !!pending;

  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  const age = d.produced_at ? Math.round((Date.now() - new Date(d.produced_at)) / 60000) : null;
  return (
    <>
      {name === 'dashboard' && <Now csrf={csrf} user={user} engine={{ waiting, start: refresh, msg: msg || status, starting }} />}
      {!d.html ? <div className="card"><p>{SOON[name] || 'Not published yet.'}</p></div> : (
        <>
          <p className="mut small">{name === 'dashboard' ? 'Daily analysis below, produced ' : 'Produced '}{age === null ? '' : age < 60 ? `${age} min ago` : `${Math.round(age / 60)} h ago`}{d.data_through ? ` · data through ${d.data_through}` : ''}.</p>
          {d.css && <style dangerouslySetInnerHTML={{ __html: d.css }} />}
          <div className="engine" dangerouslySetInnerHTML={{ __html: d.html }} />
        </>)}
    </>
  );
}
