export default function CartButton({ cart, onOpen }) {
  const count = cart.length;
  const hasItems = count > 0;
  return (
    <button
      type="button"
      className={`cart-btn ${hasItems ? 'has-items' : ''}`}
      onClick={onOpen}
      title={hasItems ? `Review ${count} item${count === 1 ? '' : 's'} in shipment` : 'Shipment cart is empty'}
    >
      🛒 Shipment
      <span className="cart-badge">{count}</span>
    </button>
  );
}
