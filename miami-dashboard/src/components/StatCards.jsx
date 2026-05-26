export default function StatCards({ summaryMap }) {
  const total = summaryMap['GRAND TOTAL'] ?? { count: 0, units: 0 };
  const sections = [
    { key: 'URGENT',  label: 'Urgent',  sub: '< 30d',     color: '#dc2626' },
    { key: 'PLANNED', label: 'Planned', sub: '≥ 30d',     color: '#eab308' },
    { key: 'UV',      label: 'UV',      sub: 'GK0486',    color: '#8b5cf6' },
    { key: 'STEEL',   label: 'Steel',   sub: 'GK0541/715', color: '#64748b' },
  ];

  return (
    <div className="hero-row">
      <div className="hero-card">
        <div className="hero-label">Ship today</div>
        <div className="hero-value">
          {total.units.toLocaleString()}
          <span className="hero-unit"> units</span>
        </div>
        <div className="hero-sub">
          across <strong>{total.count}</strong> SKUs in <strong>4</strong> sections
        </div>
      </div>

      <div className="hero-chips">
        {sections.map(s => {
          const v = summaryMap[s.key] ?? { count: 0, units: 0 };
          return (
            <div key={s.key} className="chip" style={{ borderLeftColor: s.color }}>
              <div className="chip-head">
                <span className="chip-count" style={{ color: s.color }}>{v.count}</span>
                <span className="chip-label">{s.label}</span>
              </div>
              <div className="chip-foot">
                <span className="chip-units">{v.units.toLocaleString()} units</span>
                <span className="chip-sub">{s.sub}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
