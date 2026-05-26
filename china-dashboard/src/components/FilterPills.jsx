import { SECTIONS } from '../sections.js';

export default function FilterPills({ filter, setFilter, summaryMap }) {
  function countFor(key) {
    if (key === 'all') return summaryMap['GRAND TOTAL']?.count ?? 0;
    return summaryMap[key]?.count ?? 0;
  }

  const pills = [{ key: 'all', label: 'All' }, ...SECTIONS.map(s => ({ key: s.key, label: s.short }))];

  return (
    <div className="filter-bar">
      <span className="filter-label">Filter:</span>
      {pills.map(p => (
        <button
          key={p.key}
          type="button"
          className={`pill ${filter === p.key ? 'active' : ''}`}
          onClick={() => setFilter(p.key)}
        >
          {p.label} ({countFor(p.key)})
        </button>
      ))}
    </div>
  );
}
