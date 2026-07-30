// Small formatting + classification helpers shared across the UI.

export const usd0 = (n) =>
  '$' + Math.round(n ?? 0).toLocaleString('en-US');

export const usd = (n) =>
  '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = (n) => (n ?? 0).toLocaleString('en-US');

export const pct = (n) => (n == null ? '—' : `${n.toFixed(2)}%`);

export const pp = (n) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)} pp`;

export const shortDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y.slice(2)}`;
};

// Refund-rate severity band -> css class suffix.
export function rateBand(rate) {
  if (rate == null) return 'na';
  if (rate < 2) return 'good';
  if (rate < 4) return 'ok';
  if (rate < 7) return 'warn';
  return 'bad';
}

// Trend direction from the delta in percentage points. Up = returns rising
// (bad, red). Down = returns falling (good, green). Small moves read flat.
export function trendDir(delta) {
  if (delta == null) return 'flat';
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'flat';
}

export const CATS = [
  { key: 'PA', name: 'Piercing Aftercare' },
  { key: 'EO', name: 'Essential & Carrier Oils' },
  { key: 'NC', name: 'Choker Necklaces' },
  { key: 'GK', name: 'Gauge / Stretching Kits' },
  { key: 'PJ', name: 'Piercing Jewelry' },
];
