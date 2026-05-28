export const money = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const money3 = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

export const int = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('en-US'))

export const vel = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }))

// Days-coverage status drives the colored bar / badge in the Miami Stock table.
//   velocity > 0 but no stock           -> OUT OF STOCK (red)
//   no velocity (dormant)               -> NO DEMAND (gray)
//   else bucket by days_covered
export function coverage(item) {
  const hasVel = item.daily_velocity != null && item.daily_velocity > 0
  const stock = (item.on_hand || 0) + (item.inbound_miami || 0)
  if (hasVel && stock === 0 && (item.days_covered == null || item.days_covered === 0)) {
    return { key: 'out', label: 'OUT OF STOCK', tone: 'red' }
  }
  if (!hasVel) return { key: 'none', label: 'No Demand', tone: 'gray' }
  const d = item.days_covered || 0
  if (d <= 14) return { key: 'critical', label: `${d}d`, tone: 'red' }
  if (d <= 30) return { key: 'low', label: `${d}d`, tone: 'orange' }
  if (d <= 60) return { key: 'ok', label: `${d}d`, tone: 'yellow' }
  return { key: 'healthy', label: `${d}d`, tone: 'green' }
}

export const TONES = {
  red: { text: 'text-red-700', bg: 'bg-red-100', bar: 'bg-red-500', border: 'border-red-200' },
  orange: { text: 'text-orange-700', bg: 'bg-orange-100', bar: 'bg-orange-500', border: 'border-orange-200' },
  yellow: { text: 'text-yellow-700', bg: 'bg-yellow-100', bar: 'bg-yellow-500', border: 'border-yellow-200' },
  green: { text: 'text-green-700', bg: 'bg-green-100', bar: 'bg-green-500', border: 'border-green-200' },
  gray: { text: 'text-gray-500', bg: 'bg-gray-100', bar: 'bg-gray-300', border: 'border-gray-200' },
}
