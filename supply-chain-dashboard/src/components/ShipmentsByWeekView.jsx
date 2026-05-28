import { int } from '../lib/format.js'

export default function ShipmentsByWeekView({ weeks, rows }) {
  if (!rows.length) return <div className="py-16 text-center text-gray-400">No shipment history in this file.</div>

  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c || 0)))

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left">Component</th>
            {weeks.map((w) => (
              <th key={w} className="px-3 py-3 text-right whitespace-nowrap">{w}</th>
            ))}
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.component} className="hover:bg-gray-50">
              <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-900">{r.component}</td>
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-2 text-right tabular-nums">
                  {c ? (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-gray-700"
                      style={{ backgroundColor: `rgba(37,99,235,${0.06 + 0.5 * (c / max)})` }}
                    >
                      {int(c)}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              ))}
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{int(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
