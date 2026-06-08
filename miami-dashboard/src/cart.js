// Miami shipment cart, keyed by fbaSku (the Merchant SKU Amazon expects).
// Item shape: { fbaSku, displaySku, asin, category, quantity }
// The skill writes the FBA SKU into the "FBA SKU" column of the Miami xlsx,
// sourced from catalog.xlsx. For non-STEEL items it may differ from the
// display SKU we show in reports, so the manifest export MUST use fbaSku.

export function addToCart(cart, item) {
  const idx = cart.findIndex((c) => c.fbaSku === item.fbaSku);
  if (idx >= 0) {
    const next = cart.slice();
    next[idx] = { ...next[idx], quantity: item.quantity };
    return next;
  }
  return [...cart, item];
}

export function updateQuantity(cart, fbaSku, quantity) {
  return cart.map((c) => (c.fbaSku === fbaSku ? { ...c, quantity } : c));
}

export function removeFromCart(cart, fbaSku) {
  return cart.filter((c) => c.fbaSku !== fbaSku);
}

export function findCartItem(cart, fbaSku) {
  return cart.find((c) => c.fbaSku === fbaSku);
}

export function totalUnits(cart) {
  return cart.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
}
