import { pct, rateBand } from '../lib/format.js';

// Refund rate shown as a value plus a thin severity-colored bar.
// Bar fills relative to a 15% ceiling so typical rates stay readable.
export default function RateCell({ rate }) {
  const band = rateBand(rate);
  const width = rate == null ? 0 : Math.min(100, (rate / 15) * 100);
  return (
    <div className="ratecell">
      <span className={`rate-val rate-${band}`}>{pct(rate)}</span>
      <span className="rate-track">
        <span className={`rate-fill rate-${band}`} style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}
