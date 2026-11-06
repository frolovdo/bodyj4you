import { useEffect, useRef, useState } from 'react';

// "Refresh from Drive" — POSTs to /.netlify/functions/trigger-sync, which queues a reorder run for the
// Mac runner (automation/local-runner.mjs). The button then asks every 5 s how the run is going; when it
// is done it calls onRefresh() to re-list the snapshot folder, and the dashboard switches to the new file.
//
// States: idle → triggering → waiting (queued or running on the Mac) → done|error → idle

const POLL_MS = 5000;
const GIVE_UP_MS = 10 * 60_000;

export default function RefreshButton({ onRefresh, previousNewestId }) {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const finish = (s, msg, ms) => {
    setState(s);
    setMessage(msg);
    timerRef.current = setTimeout(() => setState('idle'), ms);
  };

  async function handleClick() {
    setState('triggering');
    setMessage(null);
    let id;
    try {
      const res = await fetch('/.netlify/functions/trigger-sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `Trigger failed (${res.status})`);
      id = body.id;
      setMessage(body.runner_online ? null : 'The Mac runner is offline. The refresh will run when the Mac is back.');
    } catch (e) {
      return finish('error', e.message || String(e), 6000);
    }

    setState('waiting');
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const res = await fetch(`/.netlify/functions/trigger-sync?id=${id}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body.error || `Status check failed (${res.status})`);
        if (body.status === 'failed') return finish('error', body.message || 'The refresh failed on the Mac.', 10000);
        if (body.status === 'done') {
          const newest = await onRefresh();
          const fresh = newest && previousNewestId && newest.id !== previousNewestId;
          return finish('done', fresh ? 'New snapshot loaded' : 'Done — no newer FBA file in Drive, so nothing changed', 5000);
        }
        if (body.status === 'requested' && !body.runner_online) setMessage('The Mac runner is offline. The refresh will run when the Mac is back.');
        else setMessage(null);
        if (Date.now() - startedAt > GIVE_UP_MS) return finish('error', 'Still not finished after 10 minutes. Check the Mac runner.', 10000);
        timerRef.current = setTimeout(poll, POLL_MS);
      } catch (e) {
        finish('error', e.message || String(e), 6000);
      }
    };
    timerRef.current = setTimeout(poll, POLL_MS);
  }

  const label =
    state === 'triggering' ? '⟳ Triggering…'
    : state === 'waiting'  ? '⟳ Refreshing on the Mac…'
    : state === 'done'     ? '✓ Done'
    : state === 'error'    ? '⚠ Retry'
                           : '⟳ Refresh from Drive';

  const title =
    message                               ? message
    : state === 'waiting'                 ? 'Running on the Mac. The snapshot list reloads by itself when it finishes.'
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
