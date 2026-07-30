import { usd0, pct, pp, int, trendDir } from '../lib/format.js';

function Kpi({ label, value, sub, subDir }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className={`kpi-sub kpi-sub-${subDir || 'flat'}`}>{sub}</div>}
    </div>
  );
}

export default function Kpis({ k }) {
  const dir = trendDir(k.blendedDelta);
  return (
    <div className="kpi-row">
      <Kpi
        label="Refund rate · 30-day avg"
        value={pct(k.blendedRate30)}
        sub={`last week ${pct(k.blendedRate7)} (${pp(k.blendedDelta)})`}
        subDir={dir}
      />
      <Kpi label="Sales · last 7 days" value={usd0(k.sales7)} sub={`${usd0(k.refund7)} refunded`} />
      <Kpi label="Products tracked" value={int(k.parents)} sub="top sellers only" />
      <Kpi
        label="Flagged"
        value={int(k.flagged)}
        sub={k.flagged ? 'rising & material' : 'none this week'}
        subDir={k.flagged ? 'up' : 'flat'}
      />
      {k.worstMover && (
        <Kpi
          label="Biggest riser"
          value={pp(k.worstMover.delta)}
          sub={k.worstMover.name}
          subDir="up"
        />
      )}
    </div>
  );
}
