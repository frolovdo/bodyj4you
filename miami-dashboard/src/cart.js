// Miami cart item shape:
//   { sku, asin, category, quantity }
// Cart is keyed by `sku` — re-adding the same SKU updates the existing entry's
// quantity. The Miami spreadsheet's "SKU" column already contains the FBA-ready
// SKU (the skill substitutes the kit FBA SKU for STEEL items via display_sku),
// so no separate fbaSku tracking is needed here.

export function addToCart(cart, item) {
  const idx = cart.findIndex((c) => c.sku === item.sku);
  if (idx >= 0) {
    const next = cart.slice();
    next[idx] = { ...next[idx], quantity: item.quantity };
    return next;
  }
  return [...cart, item];
}

export function updateQuantity(cart, sku, quantity) {
  return cart.map((c) => (c.sku === sku ? { ...c, quantity } : c));
}

export function removeFromCart(cart, sku) {
  return cart.filter((c) => c.sku !== sku);
}

export function findCartItem(cart, sku) {
  return cart.find((c) => c.sku === sku);
}

export function totalUnits(cart) {
  return cart.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
}
