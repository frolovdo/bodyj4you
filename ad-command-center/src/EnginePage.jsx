import React, { useEffect, useState } from 'react';
import { api } from './App.jsx';

// Phase 0: each page is produced by the engine and pushed to Supabase; this shows it with its age.
// Pages move to live functions one by one (Dashboard first, then Update campaigns with the send path).
const SOON = {
  update: 'Update campaigns moves online in phase 1 (live settings, preview, send with backup and read-back, restore). Until then it runs on the Mac.',
  hourly: 'Hourly moves online in phase 2 with the schedule runner as a scheduled function.',
  keywords: 'Keywords moves online in phase 2.',
  history: 'History moves online in phase 1 together with the send path.',
};

export default function EnginePage({ name }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('page?name=' + name).then((r) => { if (r.ok) setD(r); else setError(r.error || 'could not load'); }); }, [name]);

  if (error) return <div className="card block">{error}</div>;
  if (!d) return <p className="mut">Loading…</p>;
  if (!d.html) {
    return <div className="card"><p>{SOON[name] || 'Not published yet.'}</p></div>;
  }
  const age = d.produced_at ? Math.round((Date.now() - new Date(d.produced_at)) / 60000) : null;
  return (
    <>
      <p className="mut small">Produced {age === null ? '' : age < 60 ? `${age} min ago` : `${Math.round(age / 60)} h ago`}{d.data_through ? ` · data through ${d.data_through}` : ''}. Read-only online view; actions run on the engine until phase 1.</p>
      {d.css && <style dangerouslySetInnerHTML={{ __html: d.css }} />}
      <div className="engine" dangerouslySetInnerHTML={{ __html: d.html }} />
    </>
  );
}
