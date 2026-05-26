const PILLS = [
  { key: 'all', label: 'All' },
  { key: 'URGENT', label: 'URGENT' },
  { key: 'PLANNED', label: 'PLANNED' },
  { key: 'UV', label: 'UV' },
  { key: 'STEEL', label: 'STEEL' },
];

export default function FilterPills({ filter, setFilter, summaryMap }) {
  function countFor(key) {
    if (key === 'all') return summaryMap['GRAND TOTAL']?.count ?? 0;
    return summaryMap[key]?.count ?? 0;
  }

  return (
    <div className="filter-bar">
      <span className="filter-label">Filter:</span>
      {PILLS.map(p => (
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
