export const money = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const money3 = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

export const int = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('en-US'))

export const intOr0 = (n) => Math.round(Number(n) || 0).toLocaleString('en-US')

export const vel = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }))

export const days = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${Math.round(Number(n))} days`)
