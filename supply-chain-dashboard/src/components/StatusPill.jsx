import { statusOf } from '../lib/status.js'

export default function StatusPill({ item, status }) {
  const s = status || statusOf(item)
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  )
}
