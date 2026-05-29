import { useMemo, useState } from 'react'
import { money, money3, int } from '../lib/format.js'

const TABS = ['All', 'Received', 'Inbound']

function statusKey(status) {
  const s = (status || '').toUpperCase()
  if (s.includes('RECEIVED')) return 'Received'
  if (s.includes('INBOUND') || s.includes('TRANSIT')) return 'Inbound'
  if (s.includes('ON ORDER')) return 'On Order'
  return 'Other'
}

function statusTone(status) {
  const k = statusKey(status)
  if (k === 'Received') return { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' }
  if (k === 'Inbound')  return { bg: 'bg-blue-100',  text: 'text-blue-700',  dot: 'bg-blue-500'  }
  if (k === 'On Order') return { bg: 'bg-yellow-100',text: 'text-yellow-700',dot: 'bg-yellow-500'}
  return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
}

export default function InboundPOsView({ pos, total }) {
  const [tab, setTab] = useState('All')

  const counts = useMemo(() => {
    const c = { All: pos.length, Received: 0, Inbound: 0 }
    for (const p of pos) {
      const k = statusKey(p.status)
      if (k === 'Received') c.Received++
      if (k === 'Inbound') c.Inbound++
    }
    return c
  }, [pos])

  const filtered = useMemo(() => {
    if (tab === 'All') return pos
    return pos.filter((p) => statusKey(p.status) === tab)
  }, [pos, tab])

  if (!pos.length) return <div className="py-16 text-center text-gray-400">No inbound POs in this file.</div>

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">Inbound Purchase Orders</h2>
        <div className="ml-auto rounded-xl border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">
          Total: <span className="font-semibold tabular-nums text-blue-700">{money(total)}</span>
        </div>
      </div>

      <div className="mb-3 inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t} <span className="opacity-70">({counts[t] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map((po, i) => {
          const tone = statusTone(po.status)
          return (
            <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.bg} ${tone.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} /> {po.status}
                </span>
                <span className="font-semibold text-gray-900">{po.name}</span>
                <span className="text-xs text-gray-500">{po.freight}</span>
                <span className="text-xs text-gray-500">Shipped {String(po.shipped)} · ETA {String(po.eta)}</span>
                <span className="ml-auto font-semibold text-gray-900 tabular-nums">{money(po.subtotal)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2">Component</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Cost</th>
                    <th className="px-4 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
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
        {filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400">No POs match this filter.</div>
        )}
      </div>
    </div>
  )
}
