import { money, int } from '../lib/format.js'

// Local, in-memory shipments. Created from New PO via the "Create Shipment"
// button. Each shipment starts INBOUND; user can flip it to RECEIVED.
//
// This list is intentionally NOT persisted yet — it survives navigation
// between pages but is wiped on full reload. Adding localStorage is a
// small follow-up if/when the workflow demands it.

export default function ShipmentsView({ shipments, onMarkReceived, onDelete }) {
  if (!shipments.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
        <p className="text-sm font-medium text-gray-500">No shipments yet</p>
        <p className="mt-1 text-xs text-gray-400">Create one from the New PO page after adding items.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {shipments.map((sh) => {
        const status = sh.status === 'RECEIVED' ? receivedTone : inboundTone
        const totalQty = sh.lines.reduce((s, l) => s + (l.qty || 0), 0)
        const totalCost = sh.lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0)
        return (
          <div key={sh.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {sh.status}
              </span>
              <span className="font-semibold text-gray-900">{sh.name}</span>
              <span className="text-xs text-gray-500">{sh.freight} · created {new Date(sh.createdAt).toLocaleString()}</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-gray-500">Qty: <span className="font-semibold tabular-nums text-gray-800">{int(totalQty)}</span></span>
                <span className="text-xs text-gray-500">Cost: <span className="font-semibold tabular-nums text-gray-800">{money(totalCost)}</span></span>
                {sh.status === 'INBOUND' && (
                  <button onClick={() => onMarkReceived(sh.id)} className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">Mark Received</button>
                )}
                <button onClick={() => onDelete(sh.id)} className="text-gray-300 hover:text-red-600" title="Delete shipment">×</button>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {sh.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-gray-800">{l.component}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{int(l.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">${(l.unitCost || 0).toFixed(3)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-700">{money((l.qty || 0) * (l.unitCost || 0))}</td>
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

const inboundTone  = { bg: 'bg-blue-100',  text: 'text-blue-700',  dot: 'bg-blue-500'  }
const receivedTone = { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' }
