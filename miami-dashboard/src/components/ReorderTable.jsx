import ReorderRow from './ReorderRow.jsx';
import { SECTIONS } from '../sections.js';

export default function ReorderTable({ data, summaryMap, filter, detail, cart, onAdd }) {
  const bySection = {};
  for (const sec of SECTIONS) bySection[sec.label] = [];
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
                <th className="bh-action" colSpan={1}>Shipment</th>
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
                <th className="qty-h">Qty + Add</th>
              </tr>
            </>
          ) : (
            <tr className="col-headers col-headers-compact">
              <th>SKU</th>
              <th className="num-h">Stock</th>
              <th className="vel-h">Velocity</th>
              <th className="days-h">Days</th>
              <th className="qty-h">Add to shipment</th>
            </tr>
          )}
        </thead>
        <tbody>
          {SECTIONS.map((sec) => {
            const rows = bySection[sec.label];
            if (!rows || rows.length === 0) return null;
            const visible = filter === 'all' || filter === sec.key;
            const summary = summaryMap[sec.key] ?? { count: 0, units: 0 };
            const hiddenStyle = visible ? undefined : { display: 'none' };

            return (
              <SectionBlock
                key={sec.key}
                sec={sec}
                rows={rows}
                summary={summary}
                hiddenStyle={hiddenStyle}
                detail={detail}
                colSpan={colSpan}
                cart={cart}
                onAdd={onAdd}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionBlock({ sec, rows, summary, hiddenStyle, detail, colSpan, cart, onAdd }) {
  return (
    <>
      <tr className="section-row" style={hiddenStyle}>
        <td colSpan={colSpan}>
          <span className="section-dot" style={{ background: sec.color }} />
          <span className="section-label">{sec.label}</span>
          <span className="section-count">
            {summary.count} SKUs · <strong>{summary.units.toLocaleString()}</strong> suggested units
          </span>
        </td>
      </tr>
      {rows.map((row, idx) => {
        const prev = idx > 0 ? rows[idx - 1] : null;
        const isBoundary = prev !== null && row['Parent ASIN'] !== prev['Parent ASIN'];
        return (
          <ReorderRow
            key={`${sec.key}-${idx}`}
            row={row}
            cart={cart}
            onAdd={onAdd}
            detail={detail}
            isBoundary={isBoundary}
            rowStyle={hiddenStyle}
          />
        );
      })}
    </>
  );
}
