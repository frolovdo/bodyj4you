// Tiny inline SVG icon set (stroke 2, currentColor) — no emoji/unicode glyphs.

const base = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const ArrowUp = (p) => (
  <svg {...base} {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);

export const ArrowDown = (p) => (
  <svg {...base} {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
);

export const Dash = (p) => (
  <svg {...base} {...p}><path d="M5 12h14" /></svg>
);

export const Chevron = ({ open, ...p }) => (
  <svg
    {...base}
    {...p}
    style={{
      transform: open ? 'rotate(90deg)' : 'none',
      transition: 'transform 150ms ease-out',
      ...(p.style || {}),
    }}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const External = (p) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" /><path d="M10 14L21 3" />
  </svg>
);

export const Check = (p) => (
  <svg {...base} {...p}><path d="M20 6L9 17l-5-5" /></svg>
);

export const Bell = (p) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
