// Cart item shape:
//   { fbaSku, displaySku, asin, category, quantity }
// Cart is keyed by fbaSku — re-adding the same fbaSku updates the existing entry's quantity.

export function addToCart(cart, item) {
  const idx = cart.findIndex(c => c.fbaSku === item.fbaSku);
  if (idx >= 0) {
    const next = cart.slice();
    next[idx] = { ...next[idx], quantity: item.quantity };
    return next;
  }
  return [...cart, item];
}

export function updateQuantity(cart, fbaSku, quantity) {
  return cart.map(c => c.fbaSku === fbaSku ? { ...c, quantity } : c);
}

export function removeFromCart(cart, fbaSku) {
  return cart.filter(c => c.fbaSku !== fbaSku);
}

export function findCartItem(cart, fbaSku) {
  return cart.find(c => c.fbaSku === fbaSku);
}

export function totalUnits(cart) {
  return cart.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
}
