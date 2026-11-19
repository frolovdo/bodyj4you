import { pct1, pp, trendDir } from '../lib/format.js';
import { ArrowUp, ArrowDown, Dash } from './icons.jsx';

// The council's one visual device, sized up per Denis: the refund rate is the
// hero number of the row — large type in the roomy middle column — with the
// paired bars (30d baseline gray over last-7d colored) making the increase
// visible without arithmetic.
const SCALE_MAX = 20; // % that fills the track; higher values clamp

function width(rate) {
  if (rate == null) return 0;
  return Math.min(100, (rate / SCALE_MAX) * 100);
}

export default function RateCompare({ rate7, rate30, delta, tier, big }) {
  const dir = trendDir(delta);
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Dash;
  const tone = tier === 'critical' ? 'bad' : tier === 'watch' ? 'warn' : dir === 'up' ? 'warn' : 'ok';
  const iconSize = big ? 12 : 9;
  return (
    <div className={`ratecmp ${big ? 'ratecmp-big' : ''}`}>
      <div className="ratecmp-nums">
        <span className={`ratecmp-val ratecmp-val-${tone}`}>{pct1(rate7)}</span>
        <span className={`ratecmp-delta trend-${dir}`}>
          <Icon width={iconSize} height={iconSize} />
          {pp(delta)}
        </span>
        <span className="ratecmp-base-val">avg {pct1(rate30)}</span>
      </div>
      <div className="ratecmp-bars" title={`Last 7d ${pct1(rate7)} vs 30d avg ${pct1(rate30)}`}>
        <span className="ratecmp-track">
          <span className="ratecmp-fill ratecmp-base" style={{ width: `${width(rate30)}%` }} />
        </span>
        <span className="ratecmp-track">
          <span className={`ratecmp-fill ratecmp-${tone}`} style={{ width: `${width(rate7)}%` }} />
        </span>
      </div>
    </div>
  );
}
