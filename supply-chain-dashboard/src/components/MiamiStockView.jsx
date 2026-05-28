import { useMemo, useState } from 'react'
import { coverage, TONES, money, money3, int, vel } from '../lib/format.js'

function StatusBadge({ item }) {
  const c = coverage(item)
  const t = TONES[c.tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${t.bg} ${t.text}`}>{c.label}</span>
}

export default function MiamiStockView({ items, totalReorderCost, cart, addToCart }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q) return items
    const needle = q.toLowerCase()
    return items.filter((it) => it.component.toLowerCase().includes(needle))
  }, [items, q])

  const reorderCount = items.filter((i) => i.reorder_qty && i.reorder_qty > 0).length

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Components" value={int(items.length)} />
        <Stat label="Need Reorder" value={int(reorderCount)} tone="text-orange-600" />
        <Stat label="Total Reorder Cost" value={money(totalReorderCost)} tone="text-blue-600" />
        <Stat label="In PO Cart" value={int(cart.size)} tone="text-green-600" />
      </div>

      <div className="mb-3 flex items-center justify-end">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search component…"
          className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Component</th>
              <th className="px-3 py-3 text-right">On Hand</th>
              <th className="px-3 py-3 text-right">Inbound</th>
              <th className="px-3 py-3 text-right">Velocity</th>
              <th className="px-3 py-3 text-right">Target</th>
              <th className="px-3 py-3 text-center">Coverage</th>
              <th className="px-3 py-3 text-right">Reorder Qty</th>
              <th className="px-3 py-3 text-right">Unit Cost</th>
              <th className="px-3 py-3 text-right">Reorder Cost</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((it) => {
              const inCart = cart.has(it.component)
              return (
                <tr key={it.component} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{it.component}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{int(it.on_hand)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{int(it.inbound_miami)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{vel(it.daily_velocity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{it.target_days ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center"><StatusBadge item={it} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{int(it.reorder_qty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{money3(it.unit_cost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-700">{money(it.reorder_cost)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      disabled={inCart}
                      onClick={() => addToCart(it)}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {inCart ? 'In PO' : 'Add to PO'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">No components match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  )
}
