import { usd0, pct1, pp, trendDir } from '../lib/format.js';
import { ArrowUp, ArrowDown, Dash } from './icons.jsx';

// Exactly three numbers (council spec): the refund bill, what the increase
// cost vs baseline, and the chokers-vs-rest category read.

function Kpi({ label, value, sub, tone = 'flat' }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-sub kpi-sub-${tone}`}>{sub}</div>
    </div>
  );
}

export default function Kpis({ k }) {
  const dir = trendDir(k.blendedDelta);
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Dash;
  return (
    <div className="kpi-row">
      <Kpi
        label="Refunds · last 7 days"
        value={usd0(k.refund7)}
        sub={
          <>
            {pct1(k.blendedRate7)} of {usd0(k.sales7)} sales{' '}
            <Icon width={9} height={9} /> {pp(k.blendedDelta)} vs 30d avg
          </>
        }
        tone={dir}
      />
      <Kpi
        label="Cost of the increase"
        value={`≈${usd0(k.excessTotal)}`}
        sub="extra refunds last wk vs each product's own baseline"
        tone={k.excessTotal > 500 ? 'up' : 'flat'}
      />
      <Kpi
        label="Chokers vs rest"
        value={`${pct1(k.nc.rate7)} / ${pct1(k.rest.rate7)}`}
        sub={`NC = ${k.nc.refundShare7}% of refund $ on ${pct1(k.nc.rate7)} rate`}
        tone={k.nc.rate7 > k.nc.rate30 ? 'up' : 'flat'}
      />
    </div>
  );
}
