export default function ScaleKey() {
  return (
    <>
      <div className="scale-key">
        <span>Days:</span>
        <span className="scale-key-item"><span className="scale-key-swatch" style={{ background: '#dc2626' }} />&lt; 30 critical</span>
        <span className="scale-key-item"><span className="scale-key-swatch" style={{ background: '#eab308' }} />30-45 OK</span>
        <span className="scale-key-item"><span className="scale-key-swatch" style={{ background: '#16a34a' }} />45+ goal</span>
        <span className="scale-key-item">
          <span className="days-alert" aria-hidden="true">⚠</span>
          &lt; 14 days — flag
        </span>
        <span className="scale-key-item">
          <span className="oos-badge" style={{ fontSize: 9, padding: '1px 6px' }}>OUT OF STOCK</span>
          Available = 0 (ship 20 to revive)
        </span>
      </div>
      <div className="qty-note">
        <strong>Shipment QTY</strong> = units to ship today. For longer coverage, add <strong>Velocity × extra days</strong> on top of the suggested number.
      </div>
    </>
  );
}
