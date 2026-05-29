// Product family grouping for Miami Stock, derived from the handoff document's
// constants/groups.js (PB-10, Jojoba, Rosehip, Castor, Generic, Rollers,
// Accessories). HS0002 and Tea Tree are added because they appear as distinct
// SKU prefixes in the real Miami Warehouse data; you can edit, reorder, or
// remove them here without touching anything else.
//
// First match wins. Anything that matches nothing falls into "Other".

const FAMILIES = [
  { key: 'HS0002',      label: 'HS0002',                         test: (n) => /^HS0002\b/i.test(n) },
  { key: 'PB-10',       label: 'PB-10 — Piercing Bump Removal',  test: (n) => /^PB[- ]?10\b/i.test(n) },
  { key: 'Jojoba',      label: 'Jojoba Oil',                     test: (n) => /^Jojoba\b/i.test(n) },
  { key: 'Rosehip',     label: 'Rosehip Oil',                    test: (n) => /^Rosehip\b/i.test(n) },
  { key: 'Castor',      label: 'Castor Oil',                     test: (n) => /^(Castor|[\d.]+oz Castor)\b/i.test(n) },
  { key: 'Tea Tree',    label: 'Tea Tree Oil',                   test: (n) => /^Tea Tree\b/i.test(n) && !/Roller/i.test(n) },
  { key: 'Generic',     label: 'Generic Oil',                    test: (n) => /^Generic\b/i.test(n) || /^16oz Pure Oil/i.test(n) || /^Pump for/i.test(n) || /^Metal Tin/i.test(n) },
  { key: 'Rollers',     label: 'Rollers',                        test: (n) => /Roller/i.test(n) },
  { key: 'Accessories', label: 'Accessories',                    test: (n) => /Brush|Lash/i.test(n) },
]

const OTHER = { key: 'Other', label: 'Other', test: () => true }

export function familyOf(component) {
  for (const f of FAMILIES) if (f.test(component)) return f
  return OTHER
}

// Returns [{ key, label, items: [...] }, ...] preserving the FAMILIES order,
// skipping families that ended up empty.
export function groupByFamily(items) {
  const map = new Map()
  for (const f of [...FAMILIES, OTHER]) map.set(f.key, { key: f.key, label: f.label, items: [] })
  for (const it of items) {
    const f = familyOf(it.component)
    map.get(f.key).items.push(it)
  }
  return Array.from(map.values()).filter((g) => g.items.length > 0)
}

// Two-letter initials for the colored family chip on each row.
export function familyInitials(key) {
  if (key === 'HS0002') return 'HS'
  if (key === 'PB-10') return 'PB'
  return key.slice(0, 3).toUpperCase()
}
