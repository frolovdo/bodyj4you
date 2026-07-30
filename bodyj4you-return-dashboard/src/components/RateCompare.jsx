import { pct1, pp, trendDir } from '../lib/format.js';
import { ArrowUp, ArrowDown, Dash } from './icons.jsx';

// The council's one visual device: paired bars on a shared scale —
// 30d baseline (gray) above last-7d (colored by tier/severity). The alert
// condition IS "7d bar longer than 30d bar", visible without arithmetic.
const SCALE_MAX = 20; // % that fills the track; higher values clamp

function width(rate) {
  if (rate == null) return 0;
  return Math.min(100, (rate / SCALE_MAX) * 100);
}

export default function RateCompare({ rate7, rate30, delta, tier }) {
  const dir = trendDir(delta);
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Dash;
  const tone = tier === 'critical' ? 'bad' : tier === 'watch' ? 'warn' : dir === 'up' ? 'warn' : 'ok';
  return (
    <div className="ratecmp">
      <div className="ratecmp-bars" title={`Last 7d ${pct1(rate7)} vs 30d avg ${pct1(rate30)}`}>
        <span className="ratecmp-track">
          <span className="ratecmp-fill ratecmp-base" style={{ width: `${width(rate30)}%` }} />
        </span>
        <span className="ratecmp-track">
          <span className={`ratecmp-fill ratecmp-${tone}`} style={{ width: `${width(rate7)}%` }} />
        </span>
      </div>
      <div className="ratecmp-nums">
        <span className={`ratecmp-val ratecmp-val-${tone}`}>{pct1(rate7)}</span>
        <span className={`ratecmp-delta trend-${dir}`}>
          <Icon width={9} height={9} />
          {pp(delta)}
        </span>
        <span className="ratecmp-base-val">avg {pct1(rate30)}</span>
      </div>
    </div>
  );
}
