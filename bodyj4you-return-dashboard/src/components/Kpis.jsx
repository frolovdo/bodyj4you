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
        label="Refund rate · last 7 days"
        value={pct(k.blendedRate7)}
        sub={`${pp(k.blendedDelta)} vs 30-day avg (${pct(k.blendedRate30)})`}
        subDir={dir}
      />
      <Kpi label="Refunds · last 7 days" value={usd0(k.refund7)} sub={`of ${usd0(k.sales7)} sales`} />
      <Kpi label="Parents tracked" value={int(k.parents)} sub="with significant sales" />
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
