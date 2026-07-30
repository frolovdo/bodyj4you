// Small formatting + classification helpers shared across the UI.

export const usd0 = (n) =>
  '$' + Math.round(n ?? 0).toLocaleString('en-US');

export const int = (n) => (n ?? 0).toLocaleString('en-US');

export const pct1 = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
export const pct = (n) => (n == null ? '—' : `${n.toFixed(2)}%`);

export const pp = (n) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}pp`;

export const amazonUrl = (asin) => `https://www.amazon.com/dp/${asin}`;
export const reviewsUrl = (asin) => `https://www.amazon.com/product-reviews/${asin}`;

export const shortDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
};

// Trend direction from the delta in percentage points. Up = returns rising
// (bad, red). Down = returns falling (good, green). Small moves read flat.
export function trendDir(delta) {
  if (delta == null) return 'flat';
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'flat';
}

// ---- acknowledge / snooze (localStorage, 30 days) ---------------------------
const ACK_KEY = 'rr-ack-v1';

export function loadAcks() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACK_KEY) || '{}');
    const now = Date.now();
    const live = {};
    for (const [fam, v] of Object.entries(raw)) {
      if (v && v.until && Date.parse(v.until) > now) live[fam] = v;
    }
    return live;
  } catch {
    return {};
  }
}

export function saveAck(family, note) {
  const acks = loadAcks();
  const until = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  acks[family] = { until, note: note || '' };
  localStorage.setItem(ACK_KEY, JSON.stringify(acks));
  return acks;
}

export function clearAck(family) {
  const acks = loadAcks();
  delete acks[family];
  localStorage.setItem(ACK_KEY, JSON.stringify(acks));
  return acks;
}
