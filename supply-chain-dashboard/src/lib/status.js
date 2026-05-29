// Days-coverage status buckets from the handoff's filter pills.
//
//   Critical  < 30 days
//   Urgent    30–59 days
//   Order     60–119 days
//   OK        120+ days
//   No Demand velocity = 0 (dormant)
//
// "Out of stock" (velocity > 0 but on_hand + inbound = 0) collapses into Critical
// — the user already sees the empty bar and 0d label, so a separate bucket
// would just complicate the filter pills.

export const STATUSES = [
  { key: 'Critical',  label: 'Critical',  range: '< 30 days',  tone: 'red',    text: 'text-red-700',    bg: 'bg-red-100',    bar: 'bg-red-500',    dot: 'bg-red-500',    soft: 'bg-red-50' },
  { key: 'Urgent',    label: 'Urgent',    range: '30–59 days', tone: 'orange', text: 'text-orange-700', bg: 'bg-orange-100', bar: 'bg-orange-500', dot: 'bg-orange-500', soft: 'bg-orange-50' },
  { key: 'Order',     label: 'Order',     range: '60–119 days',tone: 'yellow', text: 'text-yellow-700', bg: 'bg-yellow-100', bar: 'bg-yellow-500', dot: 'bg-yellow-500', soft: 'bg-yellow-50' },
  { key: 'OK',        label: 'OK',        range: '120+ days',  tone: 'green',  text: 'text-green-700',  bg: 'bg-green-100',  bar: 'bg-green-500',  dot: 'bg-green-500',  soft: 'bg-green-50' },
  { key: 'No Demand', label: 'No Demand', range: 'dormant',    tone: 'gray',   text: 'text-gray-500',   bg: 'bg-gray-100',   bar: 'bg-gray-300',   dot: 'bg-gray-400',   soft: 'bg-gray-50' },
]

const BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

export function statusOf(item) {
  const vel = Number(item.daily_velocity) || 0
  if (vel <= 0) return BY_KEY['No Demand']
  const days = Number(item.days_covered)
  if (!Number.isFinite(days)) return BY_KEY['Critical'] // velocity but no coverage
  if (days < 30) return BY_KEY['Critical']
  if (days < 60) return BY_KEY['Urgent']
  if (days < 120) return BY_KEY['Order']
  return BY_KEY['OK']
}

// Counts by bucket for the stat cards and filter pills.
export function countByStatus(items) {
  const c = Object.fromEntries(STATUSES.map((s) => [s.key, 0]))
  for (const it of items) c[statusOf(it).key]++
  return c
}

// Days as a percentage of target, clamped to [0, 1]. Used for the progress bar.
export function coverageFraction(item) {
  const target = Number(item.target_days) || 0
  const days = Number(item.days_covered) || 0
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, days / target))
}

export function statusByKey(key) {
  return BY_KEY[key]
}
