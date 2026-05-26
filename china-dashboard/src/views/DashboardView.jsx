import { useMemo, useState } from 'react';
import StatCards from '../components/StatCards.jsx';
import FilterPills from '../components/FilterPills.jsx';
import ScaleKey from '../components/ScaleKey.jsx';
import ReorderTable from '../components/ReorderTable.jsx';
import CartButton from '../components/CartButton.jsx';
import { SECTION_LABEL_TO_KEY } from '../sections.js';

function summaryByKey(summary) {
  const map = {};
  for (const row of summary) {
    const k = SECTION_LABEL_TO_KEY[row.Section] ?? row.Section;
    map[k] = { count: Number(row['SKU Count']) || 0, units: Number(row['Total Units']) || 0 };
  }
  return map;
}

function deriveDateLabel(fileName) {
  if (!fileName) return null;
  const m = fileName.match(/(\d{2})[._-](\d{2})[._-](\d{2,4})/);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

export default function DashboardView({ data, summary, fileMeta, cart, onAdd, onOpenShipment, onSwap }) {
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(true);

  const summaryMap = useMemo(() => summaryByKey(summary), [summary]);

  const dateLabel = fileMeta?.snapshotLabel || deriveDateLabel(fileMeta?.name);
  const modifiedLabel = fileMeta?.lastModified
    ? fileMeta.lastModified.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <main className="main">
      <div className="header-row">
        <div className="title-block">
          <h2 className="title">China Weekly Reorder</h2>
          {dateLabel && <span className="snapshot-pill" title="Date of this reorder snapshot">📅 Snapshot {dateLabel}</span>}
        </div>
        <div className="header-right">
          <CartButton cart={cart} onOpen={onOpenShipment} />
          <button
            type="button"
            className={`toggle-btn ${detail ? 'on' : ''}`}
            onClick={() => setDetail(d => !d)}
            title={detail ? 'Hide ASIN, parent, reserved, min, status' : 'Show ASIN, parent, reserved, min, status'}
          >
            {detail ? '◐ Detail' : '○ Compact'}
          </button>
          <button type="button" className="swap-btn" onClick={onSwap}>
            ↻ Swap file
          </button>
        </div>
      </div>

      {fileMeta?.name && (
        <div className="source-note">
          loaded from <strong>{fileMeta.name}</strong>{modifiedLabel ? ` · ${modifiedLabel}` : ''}{fileMeta.source === 'drive' ? ' · via Google Drive' : ''}
        </div>
      )}

      <StatCards summaryMap={summaryMap} />

      <FilterPills filter={filter} setFilter={setFilter} summaryMap={summaryMap} />

      <ScaleKey />

      <ReorderTable
        data={data}
        summaryMap={summaryMap}
        filter={filter}
        detail={detail}
        cart={cart}
        onAdd={onAdd}
      />

      <div className="footer-note">
        Visualization of Reorder_China xlsx · {summaryMap['GRAND TOTAL']?.count ?? 0} SKUs · {(summaryMap['GRAND TOTAL']?.units ?? 0).toLocaleString()} suggested units · Manifest uses FBA SKU, not display SKU
      </div>
    </main>
  );
}
