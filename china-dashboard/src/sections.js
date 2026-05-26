// Section configuration shared by Dashboard, StatCards, FilterPills, ReorderTable.
// Order matters — sections render in this order.

export const SECTIONS = [
  { label: 'PL6328 TAPER PLUGS', key: 'PL6328', short: 'PL6328',   chipSub: 'Taper plugs', color: '#0891b2' },
  { label: 'GK GAUGES & KITS',   key: 'GK',     short: 'GK',       chipSub: 'Gauges & kits', color: '#7c3aed' },
  { label: 'PJ + FJ JEWELRY',    key: 'PJ_FJ',  short: 'PJ+FJ',    chipSub: 'Jewelry',     color: '#db2777' },
  { label: 'NC CHOKERS',         key: 'NC',     short: 'NC',       chipSub: 'Chokers',     color: '#ea580c' },
];

export const SECTION_LABEL_TO_KEY = Object.fromEntries(
  SECTIONS.map(s => [s.label, s.key])
);
