import { SECTIONS } from '../sections.js';

export default function StatCards({ summaryMap }) {
  const total = summaryMap['GRAND TOTAL'] ?? { count: 0, units: 0 };

  return (
    <div className="hero-row">
      <div className="hero-card">
        <div className="hero-label">Ship to FBA</div>
        <div className="hero-value">
          {total.units.toLocaleString()}
          <span className="hero-unit"> units</span>
        </div>
        <div className="hero-sub">
          across <strong>{total.count}</strong> SKUs in <strong>{SECTIONS.length}</strong> blocks
        </div>
      </div>

      <div className="hero-chips">
        {SECTIONS.map(s => {
          const v = summaryMap[s.key] ?? { count: 0, units: 0 };
          return (
            <div key={s.key} className="chip" style={{ borderLeftColor: s.color }}>
              <div className="chip-head">
                <span className="chip-count" style={{ color: s.color }}>{v.count}</span>
                <span className="chip-label">{s.short}</span>
              </div>
              <div className="chip-foot">
                <span className="chip-units">{v.units.toLocaleString()} units</span>
                <span className="chip-sub">{s.chipSub}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
