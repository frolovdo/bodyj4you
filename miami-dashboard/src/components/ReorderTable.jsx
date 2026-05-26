import DaysBar from './DaysBar.jsx';

const SECTION_ORDER = [
  { label: 'URGENT FBA',  key: 'URGENT',  color: '#dc2626' },
  { label: 'PLANNED FBA', key: 'PLANNED', color: '#eab308' },
  { label: 'UV',          key: 'UV',      color: '#8b5cf6' },
  { label: 'STEEL',       key: 'STEEL',   color: '#64748b' },
];

function fmtNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString();
}

function fmtVel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return n.toFixed(1);
}

function asBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
  }
  return Boolean(v);
}

export default function ReorderTable({ data, summaryMap, filter, detail }) {
  const bySection = {};
  for (const sec of SECTION_ORDER) bySection[sec.label] = [];
  for (const row of data) {
    if (bySection[row.Section]) bySection[row.Section].push(row);
  }

  const colSpan = detail ? 12 : 5;

  return (
    <div className="table-wrap">
      <table className={detail ? 'mode-detail' : 'mode-compact'}>
        <thead>
          {detail ? (
            <>
              <tr className="block-headers">
                <th className="bh-product" colSpan={4}>Product</th>
                <th className="bh-inv" colSpan={3}>Inventory</th>
                <th className="bh-demand" colSpan={2}>Demand</th>
                <th className="bh-meta" colSpan={2}>Reference</th>
                <th className="bh-action" colSpan={1}>Reorder</th>
              </tr>
              <tr className="col-headers">
                <th>SKU</th>
                <th>ASIN</th>
                <th>Parent</th>
                <th>Cat</th>
                <th className="num-h">Available</th>
                <th className="num-h">Inbound</th>
                <th className="num-h">Reserved</th>
                <th className="days-h">Days</th>
                <th className="vel-h">Velocity</th>
                <th className="num-h">Min</th>
                <th>Status</th>
                <th className="qty-h">QTY</th>
              </tr>
            </>
          ) : (
            <tr className="col-headers col-headers-compact">
              <th>SKU</th>
              <th className="num-h">Stock</th>
              <th className="vel-h">Velocity</th>
              <th className="days-h">Days</th>
              <th className="qty-h">QTY</th>
            </tr>
          )}
        </thead>
        <tbody>
          {SECTION_ORDER.map(sec => {
            const rows = bySection[sec.label];
            if (!rows || rows.length === 0) return null;
            const visible = filter === 'all' || filter === sec.key;
            const summary = summaryMap[sec.key] ?? { count: 0, units: 0 };

            return (
              <SectionBlock
                key={sec.key}
                sec={sec}
                rows={rows}
                summary={summary}
                visible={visible}
                detail={detail}
                colSpan={colSpan}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionBlock({ sec, rows, summary, visible, detail, colSpan }) {
  const display = visible ? '' : 'none';

  return (
    <>
      <tr className="section-row" style={{ display }}>
        <td colSpan={colSpan}>
          <span className="section-dot" style={{ background: sec.color }} />
          <span className="section-label">{sec.label}</span>
          <span className="section-count">
            {summary.count} SKUs · <strong>{summary.units.toLocaleString()}</strong> units
          </span>
        </td>
      </tr>
      {rows.map((row, idx) => {
        const prev = idx > 0 ? rows[idx - 1] : null;
        const isBoundary = prev !== null && row['Parent ASIN'] !== prev['Parent ASIN'];
        const isOos = asBool(row['Out Of Stock']);
        const status = asBool(row.Status);

        const cls = ['data-row'];
        if (isBoundary) cls.push('parent-boundary');
        if (isOos) cls.push('row-oos');

        return (
          <tr key={`${sec.key}-${idx}`} className={cls.join(' ')} style={{ display }}>
            {detail ? (
              <DetailRow row={row} status={status} isOos={isOos} />
            ) : (
              <CompactRow row={row} status={status} isOos={isOos} />
            )}
          </tr>
        );
      })}
    </>
  );
}

function StatusDot({ status }) {
  const title = status ? 'Status: TRUE — pipeline ≥ min level' : 'Status: FALSE — below min level';
  return (
    <span
      className={`status-dot ${status ? 'status-dot-ok' : 'status-dot-low'}`}
      title={title}
      aria-label={title}
    />
  );
}

function CompactRow({ row, status, isOos }) {
  return (
    <>
      <td className="blk-product blk-start sku-cell sku-compact">
        <StatusDot status={status} />
        <span className="sku-name">{row.SKU}</span>
        <span className="sku-asin">{row.ASIN}</span>
      </td>
      <td className="blk-inv blk-start stock-cell">
        <span className="stock-avail">{fmtNum(row.Available)}</span>
        {Number(row.Inbound) > 0 && (
          <span className="stock-inbound">+{fmtNum(row.Inbound)} in</span>
        )}
      </td>
      <td className="blk-demand blk-start vel-cell">
        <span className="vel-num">{fmtVel(row['Weighted Velocity'])}</span>
        <span className="vel-unit">/d</span>
      </td>
      <td className="blk-demand days-cell">
        <DaysBar days={row['Display Days']} amazonDays={row['Amazon Days']} isOos={isOos} />
      </td>
      <td className="blk-action qty-cell">
        <span className="qty-num">{fmtNum(row.QTY)}</span>
      </td>
    </>
  );
}

function DetailRow({ row, status, isOos }) {
  return (
    <>
      <td className="blk-product blk-start sku-cell">{row.SKU}</td>
      <td className="blk-product asin">{row.ASIN}</td>
      <td className="blk-product parent">{row['Parent ASIN']}</td>
      <td className="blk-product cat">{row.Category}</td>
      <td className="blk-inv blk-start num">{fmtNum(row.Available)}</td>
      <td className="blk-inv num">{fmtNum(row.Inbound)}</td>
      <td className="blk-inv num">{fmtNum(row.Reserved)}</td>
      <td className="blk-demand blk-start days-cell">
        <DaysBar days={row['Display Days']} amazonDays={row['Amazon Days']} isOos={isOos} />
      </td>
      <td className="blk-demand vel-cell">
        <span className="vel-num">{fmtVel(row['Weighted Velocity'])}</span>
      </td>
      <td className="blk-meta blk-start num">{fmtNum(row['Min Level'])}</td>
      <td className={`blk-meta ${status ? 'status-true' : 'status-false'}`}>
        {status ? 'TRUE' : 'FALSE'}
      </td>
      <td className="blk-action qty-cell">
        <span className="qty-num">{fmtNum(row.QTY)}</span>
      </td>
    </>
  );
}
