import { useMemo, useState } from 'react';
import StatCards from './StatCards.jsx';
import FilterPills from './FilterPills.jsx';
import ScaleKey from './ScaleKey.jsx';
import ReorderTable from './ReorderTable.jsx';
import { APP_TITLE } from '../config.js';

const SECTION_LABEL_TO_KEY = {
  'URGENT FBA': 'URGENT',
  'PLANNED FBA': 'PLANNED',
  'UV': 'UV',
  'STEEL': 'STEEL',
};

function summaryByKey(summary) {
  const map = {};
  for (const row of summary) {
    const k = SECTION_LABEL_TO_KEY[row.Section] ?? row.Section;
    map[k] = { count: Number(row['SKU Count']) || 0, units: Number(row['Total Units']) || 0 };
  }
  return map;
}

export default function Dashboard({ data, summary, snapshots, selected, onPick, loading, error }) {
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(true);

  const summaryMap = useMemo(() => summaryByKey(summary), [summary]);
  const selectedLabel = selected?.date?.label ?? null;

  return (
    <main className="main">
      <div className="header-row">
        <div className="title-block">
          <h2 className="title">{APP_TITLE}</h2>
          {selectedLabel && (
            <span className="snapshot-pill" title="Date of this reorder snapshot">
              📅 Snapshot {selectedLabel}
            </span>
          )}
        </div>
        <div className="header-right">
          {snapshots.length > 0 && (
            <select
              className="date-picker"
              value={selected?.id ?? ''}
              onChange={(e) => {
                const f = snapshots.find((s) => s.id === e.target.value);
                if (f) onPick(f);
              }}
              disabled={loading}
              title="Pick a different snapshot date"
            >
              {snapshots.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {s.date.label}{i === 0 ? ' (latest)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`toggle-btn ${detail ? 'on' : ''}`}
            onClick={() => setDetail((d) => !d)}
            title={detail ? 'Hide ASIN, parent, reserved, min, status' : 'Show ASIN, parent, reserved, min, status'}
          >
            {detail ? '◐ Detail' : '○ Compact'}
          </button>
        </div>
      </div>

      <div className="source-note">
        {selected?.name && (
          <>
            from <strong>{selected.name}</strong> · {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} in Drive
          </>
        )}
        {loading && <> · refreshing…</>}
        {error && <> · <span style={{ color: '#b91c1c' }}>{error}</span></>}
      </div>

      <StatCards summaryMap={summaryMap} />

      <FilterPills filter={filter} setFilter={setFilter} summaryMap={summaryMap} />

      <ScaleKey />

      <ReorderTable data={data} summaryMap={summaryMap} filter={filter} detail={detail} />

      <div className="footer-note">
        Live from Google Drive · {summaryMap['GRAND TOTAL']?.count ?? 0} SKUs · {(summaryMap['GRAND TOTAL']?.units ?? 0).toLocaleString()} units
      </div>
    </main>
  );
}
