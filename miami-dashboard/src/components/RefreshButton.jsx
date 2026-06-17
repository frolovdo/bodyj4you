import { useEffect, useRef, useState } from 'react';

// "Refresh from Drive" — POSTs to /.netlify/functions/trigger-sync, which
// triggers the GitHub Action that regenerates the OUT xlsx files. After the
// workflow has had time to land (~45 s), calls onRefresh() to re-list the
// snapshot folder; the dashboard auto-switches to the new file if found.
//
// States: idle → triggering → waiting (workflow running) → done|error → idle

const WAIT_MS = 45000; // workflow ≈ 30 s; pad to 45 s

export default function RefreshButton({ onRefresh, previousNewestId }) {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleClick() {
    setState('triggering');
    setMessage(null);
    try {
      const res = await fetch('/.netlify/functions/trigger-sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `Trigger failed (${res.status})`);
      }
    } catch (e) {
      setState('error');
      setMessage(e.message || String(e));
      timerRef.current = setTimeout(() => setState('idle'), 6000);
      return;
    }

    setState('waiting');
    timerRef.current = setTimeout(async () => {
      try {
        const newest = await onRefresh();
        if (newest && previousNewestId && newest.id !== previousNewestId) {
          setMessage('New snapshot loaded');
        } else {
          setMessage('No new snapshot yet — try again in a moment');
        }
        setState('done');
      } catch (e) {
        setState('error');
        setMessage(`Re-list failed: ${e.message || e}`);
      } finally {
        timerRef.current = setTimeout(() => setState('idle'), 4000);
      }
    }, WAIT_MS);
  }

  const label =
    state === 'triggering' ? '⟳ Triggering…'
    : state === 'waiting'  ? '⟳ Refreshing (~30 s)…'
    : state === 'done'     ? '✓ Done'
    : state === 'error'    ? '⚠ Retry'
                           : '⟳ Refresh from Drive';

  const title =
    state === 'error'                     ? message
    : state === 'waiting'                 ? 'Workflow is running. Will re-fetch the snapshot list automatically.'
    : state === 'done' && message         ? message
                                          : 'Re-run the skill against the latest FBA file in Drive and pull the new snapshot';

  return (
    <button
      type="button"
      className={`refresh-btn refresh-${state}`}
      onClick={handleClick}
      disabled={state === 'triggering' || state === 'waiting'}
      title={title}
    >
      {label}
    </button>
  );
}
