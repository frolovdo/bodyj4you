import { pp, trendDir } from '../lib/format.js';

// Delta in percentage points of refund rate: last week vs 30-day average.
// Up arrow = returns getting worse (red); down = improving (green).
export default function TrendBadge({ delta }) {
  const dir = trendDir(delta);
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
  return (
    <span className={`trend trend-${dir}`} title="Last week vs 30-day average">
      <span className="trend-arrow">{arrow}</span>
      {pp(delta)}
    </span>
  );
}
