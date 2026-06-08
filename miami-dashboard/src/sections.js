// Miami section configuration. Order matters — sections render in this order.

export const SECTIONS = [
  { label: 'URGENT FBA',  key: 'URGENT',  short: 'URGENT',  chipSub: '< 30 days',   color: '#dc2626' },
  { label: 'PLANNED FBA', key: 'PLANNED', short: 'PLANNED', chipSub: '≥ 30 days',   color: '#eab308' },
  { label: 'UV',          key: 'UV',      short: 'UV',      chipSub: 'GK0486',      color: '#8b5cf6' },
  { label: 'STEEL',       key: 'STEEL',   short: 'STEEL',   chipSub: 'GK0541/715',  color: '#64748b' },
];

export const SECTION_LABEL_TO_KEY = Object.fromEntries(
  SECTIONS.map((s) => [s.label, s.key])
);
