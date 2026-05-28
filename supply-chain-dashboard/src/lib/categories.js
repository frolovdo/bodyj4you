// Components don't carry an explicit category column, so we derive one from the
// component name by keyword. Order matters — first match wins. Edit freely.
const RULES = [
  { cat: 'Oils', tone: 'amber', test: /\b(jojoba|castor|rosehip|argan|oil|carrier)\b/i },
  { cat: 'Bottles', tone: 'blue', test: /\bbottle\b/i },
  { cat: 'Boxes', tone: 'purple', test: /\bbox\b/i },
  { cat: 'Rollers', tone: 'teal', test: /\broller|rollerball\b/i },
  { cat: 'Caps & Pumps', tone: 'pink', test: /\b(cap|pump|sprayer|dropper|pipette|lid)\b/i },
  { cat: 'Tubes', tone: 'orange', test: /\b(tube|mascara)\b/i },
  { cat: 'Accessories', tone: 'green', test: /\b(brush|lash|bag|card|insert|sticker|label|funnel)\b/i },
]

export function categoryOf(component) {
  for (const r of RULES) if (r.test.test(component)) return r
  return { cat: 'Other', tone: 'gray' }
}

export const CAT_TONES = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
}

export function buildCategories(items) {
  const seen = new Map()
  for (const it of items) {
    const { cat, tone } = categoryOf(it.component)
    if (!seen.has(cat)) seen.set(cat, { cat, tone, count: 0 })
    seen.get(cat).count++
  }
  return Array.from(seen.values())
}
