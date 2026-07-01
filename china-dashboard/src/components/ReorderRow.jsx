import { useEffect, useState } from 'react';
import DaysBar from './DaysBar.jsx';
import { findCartItem } from '../cart.js';

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

export default function ReorderRow({ row, cart, onAdd, detail, isBoundary, rowStyle }) {
  const fbaSku = row['FBA SKU'];
  const isOos = asBool(row['Out Of Stock']);
  const status = asBool(row.Status);

  const cartItem = findCartItem(cart, fbaSku);
  const inCart = !!cartItem;
  const [qty, setQty] = useState(() => Number(row.QTY) || 0);

  // If the cart entry changes (e.g. edited on shipment page), keep input in sync.
  useEffect(() => {
    if (inCart) setQty(cartItem.quantity);
  }, [cartItem?.quantity]);   // eslint-disable-line react-hooks/exhaustive-deps

  const isUpdate = inCart && Number(cartItem.quantity) !== Number(qty);
  const buttonClass = isUpdate ? 'add-btn update' : inCart ? 'add-btn added' : 'add-btn';
  const buttonText = isUpdate ? 'Update' : inCart ? '✓ Added' : '+ Add';

  function clickAdd() {
    const q = Number(qty) || 0;
    if (q <= 0) return;
    onAdd({
      fbaSku,
      displaySku: row.SKU,
      asin: row.ASIN,
      category: row.Category,
      quantity: q,
    });
  }

  const trCls = ['data-row'];
  if (isBoundary) trCls.push('parent-boundary');
  if (isOos) trCls.push('row-oos');
  if (inCart) trCls.push('row-added');

  if (detail) {
    return (
      <tr className={trCls.join(' ')} style={rowStyle}>
        <td className="blk-product blk-start sku-cell">{row.SKU}</td>
        <td className="blk-product fba-sku-cell">{fbaSku}</td>
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
        <td className="blk-demand num">{fmtNum(row['Sales 30 Days'])}</td>
        <td className="blk-meta blk-start num">{fmtNum(row['Min Level'])}</td>
        <td className={`blk-meta ${status ? 'status-true' : 'status-false'}`}>
          {status ? 'TRUE' : 'FALSE'}
        </td>
        <td className="blk-action action-cell">
          <ActionInput qty={qty} setQty={setQty} buttonClass={buttonClass} buttonText={buttonText} clickAdd={clickAdd} />
        </td>
      </tr>
    );
  }

  // Compact mode
  return (
    <tr className={trCls.join(' ')} style={rowStyle}>
      <td className="blk-product blk-start sku-cell sku-compact">
        <StatusDot status={status} />
        <span className="sku-name">{row.SKU}</span>
        <span className="sku-asin">{row.ASIN}</span>
      </td>
      <td className="blk-product fba-sku-cell">{fbaSku}</td>
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
      <td className="blk-demand num">{fmtNum(row['Sales 30 Days'])}</td>
      <td className="blk-demand days-cell">
        <DaysBar days={row['Display Days']} amazonDays={row['Amazon Days']} isOos={isOos} />
      </td>
      <td className="blk-action action-cell">
        <ActionInput qty={qty} setQty={setQty} buttonClass={buttonClass} buttonText={buttonText} clickAdd={clickAdd} />
      </td>
    </tr>
  );
}

function ActionInput({ qty, setQty, buttonClass, buttonText, clickAdd }) {
  return (
    <div className="action-row">
      <input
        type="number"
        className="qty-input"
        value={qty}
        min={0}
        step={1}
        onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') clickAdd(); }}
      />
      <button type="button" className={buttonClass} onClick={clickAdd} disabled={!Number(qty)}>
        {buttonText}
      </button>
    </div>
  );
}
