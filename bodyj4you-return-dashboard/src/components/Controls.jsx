import { CATS } from '../lib/format.js';

const SORTS = [
  { key: 'rate7', label: 'Refund rate' },
  { key: 'delta', label: 'Trend' },
  { key: 'r7', label: 'Refund $' },
];

export default function Controls({
  sort, setSort, cat, setCat, flaggedOnly, setFlaggedOnly, query, setQuery,
  onExpandAll, onCollapseAll, allExpanded,
}) {
  return (
    <div className="controls">
      <div className="seg">
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`seg-btn ${sort === s.key ? 'on' : ''}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pills">
        <button className={`pill ${cat === 'ALL' ? 'on' : ''}`} onClick={() => setCat('ALL')}>
          All
        </button>
        {CATS.map((c) => (
          <button
            key={c.key}
            className={`pill ${cat === c.key ? 'on' : ''}`}
            onClick={() => setCat(c.key)}
            title={c.name}
          >
            {c.key}
          </button>
        ))}
      </div>

      <label className={`flag-toggle ${flaggedOnly ? 'on' : ''}`}>
        <input
          type="checkbox"
          checked={flaggedOnly}
          onChange={(e) => setFlaggedOnly(e.target.checked)}
        />
        Flagged only
      </label>

      <input
        className="search"
        type="search"
        placeholder="Search product…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <button className="link-btn" onClick={allExpanded ? onCollapseAll : onExpandAll}>
        {allExpanded ? 'Collapse all' : 'Expand all'}
      </button>
    </div>
  );
}
