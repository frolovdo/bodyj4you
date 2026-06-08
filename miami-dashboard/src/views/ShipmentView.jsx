import { totalUnits } from '../cart.js';
import { exportManifest } from '../exportManifest.js';

export default function ShipmentView({ cart, onUpdateQty, onRemove, onClear, onBack }) {
  const skus = cart.length;
  const units = totalUnits(cart);

  function clickExport() {
    if (cart.length === 0) return;
    exportManifest(cart);
  }

  function clickClear() {
    if (cart.length === 0) return;
    if (window.confirm(`Clear all ${cart.length} item(s) from the shipment?`)) {
      onClear();
    }
  }

  return (
    <main className="main">
      <div className="header-row">
        <div className="title-block">
          <h2 className="title">Miami FBA Shipment Builder</h2>
        </div>
        <div className="header-right">
          <button type="button" className="back-btn" onClick={onBack}>
            ← Back to dashboard
          </button>
        </div>
      </div>

      {cart.length === 0 ? (
        <div className="shipment-empty">
          <h2>Your shipment is empty</h2>
          <p>Add SKUs from the dashboard to build a shipment, then come back here to review and export.</p>
          <button type="button" className="upload-btn" onClick={onBack}>← Back to dashboard</button>
        </div>
      ) : (
        <>
          <div className="shipment-summary">
            <div className="shipment-summary-left">
              <div className="shipment-summary-label">Ready to ship</div>
              <div className="shipment-summary-value">
                {units.toLocaleString()}
                <span className="hero-unit"> units</span>
              </div>
              <div className="shipment-summary-sub">
                across <strong>{skus}</strong> SKU{skus === 1 ? '' : 's'}
              </div>
            </div>
            <div className="shipment-actions">
              <button type="button" className="btn-secondary" onClick={clickClear}>
                Clear shipment
              </button>
              <button type="button" className="btn-primary" onClick={clickExport} disabled={cart.length === 0}>
                ⬇ Form FBA Shipment (.xlsx)
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="ship-table">
              <thead>
                <tr>
                  <th>SKU (Merchant SKU)</th>
                  <th>ASIN</th>
                  <th>Category</th>
                  <th className="num-h">Quantity</th>
                  <th className="action-h"> </th>
                </tr>
              </thead>
              <tbody>
                {cart.map(item => (
                  <tr key={item.sku}>
                    <td><span className="ship-fba-sku">{item.sku}</span></td>
                    <td><span className="ship-asin">{item.asin}</span></td>
                    <td><span className="ship-cat">{item.category}</span></td>
                    <td className="ship-qty-cell">
                      <input
                        type="number"
                        className="ship-qty-input"
                        value={item.quantity}
                        min={0}
                        step={1}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : Number(e.target.value);
                          onUpdateQty(item.sku, v);
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="ship-action-cell">
                      <button
                        type="button"
                        className="ship-remove-btn"
                        onClick={() => onRemove(item.sku)}
                        title={`Remove ${item.sku}`}
                        aria-label={`Remove ${item.sku}`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="footer-note">
            Manifest export will use the <strong>SKU</strong> in column A (Merchant SKU) and the quantity above in column B.
            Sheet name: <code>Create workflow – template</code> · Header on row 6 · Data from row 7.
          </div>
        </>
      )}
    </main>
  );
}
