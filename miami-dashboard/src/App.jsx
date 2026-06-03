import { useEffect, useState } from 'react';
import { listSnapshots, fetchSnapshot } from './driveSource.js';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [snapshots, setSnapshots] = useState([]); // listed Drive files
  const [selected, setSelected] = useState(null); // currently-viewed file
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // On open: list folder, auto-load newest.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await listSnapshots();
        if (cancelled) return;
        setSnapshots(list);
        if (list.length === 0) {
          setError('No reorder files found in the Drive folder yet.');
          setLoading(false);
          return;
        }
        const newest = list[0];
        setSelected(newest);
        const p = await fetchSnapshot(newest);
        if (cancelled) return;
        setParsed(p);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function onPick(file) {
    if (!file || file.id === selected?.id) return;
    setSelected(file);
    setLoading(true);
    setError(null);
    try {
      const p = await fetchSnapshot(file);
      setParsed(p);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading && !parsed) {
    return (
      <div className="boot-page">
        <div className="boot-loader">
          <div className="boot-spinner" />
          <div className="boot-text">Loading latest snapshot from Drive…</div>
        </div>
      </div>
    );
  }

  if (error && !parsed) {
    return (
      <div className="boot-page">
        <div className="error-banner">
          <div className="error-banner-title">Couldn't load data from Drive</div>
          <div className="error-banner-msg">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      data={parsed.data}
      summary={parsed.summary}
      snapshots={snapshots}
      selected={selected}
      onPick={onPick}
      loading={loading}
      error={error}
    />
  );
}
