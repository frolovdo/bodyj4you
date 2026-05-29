import { statusOf, coverageFraction } from '../lib/status.js'

// Horizontal progress bar — width = days_covered / target_days, color = status.
// Sits above the row's "NN days" caption.
export default function CoverageBar({ item }) {
  const s = statusOf(item)
  const pct = coverageFraction(item) * 100
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full ${s.bar}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
