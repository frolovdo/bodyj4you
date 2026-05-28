import { money, money3, int } from '../lib/format.js'

function statusTone(status) {
  const s = status.toUpperCase()
  if (s.includes('RECEIVED')) return { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' }
  if (s.includes('INBOUND') || s.includes('TRANSIT')) return { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' }
  if (s.includes('ON ORDER')) return { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' }
  return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
}

export default function InboundPOsView({ pos, total }) {
  if (!pos.length) return <Empty />
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <span className="text-xs uppercase tracking-wider text-gray-400">Total of all POs</span>
        <div className="mt-1 text-2xl font-bold text-blue-600">{money(total)}</div>
      </div>
      {pos.map((po, i) => {
        const tone = statusTone(po.status)
        return (
          <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.bg} ${tone.text}`}>
                <span className={`h-2 w-2 rounded-full ${tone.dot}`} /> {po.status}
              </span>
              <span className="font-semibold text-gray-900">{po.name}</span>
              <span className="text-sm text-gray-500">{po.freight}</span>
              <span className="text-sm text-gray-500">Shipped {String(po.shipped)} · ETA {String(po.eta)}</span>
              <span className="ml-auto font-semibold text-gray-900">{money(po.subtotal)}</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {po.lines.map((l, j) => (
                  <tr key={j}>
                    <td className="px-4 py-2 text-gray-800">{l.component}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{int(l.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{money3(l.unitCost)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-700">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function Empty() {
  return <div className="py-16 text-center text-gray-400">No inbound POs in this file.</div>
}
