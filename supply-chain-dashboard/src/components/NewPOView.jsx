import { useMemo } from 'react'
import { money, money3, int, intOr0 } from '../lib/format.js'
import { groupByFamily } from '../lib/families.js'
import { exportPO, SUPPLIER } from '../pdf.js'

const FREIGHTS = ['Ocean', 'Air', 'US']
const SUPPLIER_EMAIL = 'bony@fatwintrading.com'

export default function NewPOView({ cart, setQty, remove, clear, notes, setNotes, freight, setFreight, snapshotDate, onCreateShipment }) {
  const lines = useMemo(() => Array.from(cart.values()), [cart])
  const totals = useMemo(() => {
    const totalQty = lines.reduce((s, l) => s + (l.qty || 0), 0)
    const totalCost = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0)
    return { totalQty, totalCost, count: lines.length }
  }, [lines])

  // Group cart items by family. Each line item is treated as an "item" with
  // .component so the family resolver works.
  const groups = useMemo(() => groupByFamily(lines.map((l) => ({ ...l, component: l.component }))), [lines])

  function handlePDF() {
    const items = lines.filter((l) => l.qty && l.qty > 0).map((l) => ({ component: l.component, qty: l.qty, unitCost: l.unitCost || 0 }))
    if (!items.length) {
      alert('Enter a ship quantity for at least one item.')
      return
    }
    exportPO({ items, notes, freight, snapshotDate, groups: groupByFamily(items) })
  }

  function handleEmail() {
    if (!lines.length) return
    const body = encodeURIComponent(buildEmailBody(groups, notes, freight, snapshotDate))
    const subject = encodeURIComponent(`BodyJ4You PO — ${snapshotDate || ''}`)
    window.location.href = `mailto:${SUPPLIER_EMAIL}?subject=${subject}&body=${body}`
  }

  if (!lines.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
        <p className="text-sm font-medium text-gray-500">No items added yet</p>
        <p className="mt-1 text-xs text-gray-400">Go to Miami Stock to add items to your PO</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Supplier</div>
          <div className="text-base font-semibold text-gray-900">{SUPPLIER}</div>
          <div className="text-xs text-gray-500">{SUPPLIER_EMAIL}</div>
        </div>
        <div className="flex flex-wrap gap-6">
          <Metric label="Snapshot" value={snapshotDate || '—'} />
          <Metric label="Line Items" value={int(totals.count)} />
          <Metric label="Total Units" value={int(totals.totalQty)} />
          <Metric label="Grand Total" value={money(totals.totalCost)} tone="text-blue-700" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleEmail} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Email PO</button>
          {onCreateShipment && (
            <button onClick={() => onCreateShipment(lines, { freight, notes })} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Create Shipment</button>
          )}
          <button onClick={handlePDF} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Export PDF</button>
          <button onClick={clear} className="rounded-md px-2 py-1.5 text-xs text-gray-400 hover:text-red-600">Clear all</button>
        </div>
      </div>

      {/* Grouped table */}
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupTable key={g.key} group={g} setQty={setQty} remove={remove} />
        ))}
      </div>

      {/* Freight + notes */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">Freight Type</label>
          <div className="flex gap-1.5">
            {FREIGHTS.map((f) => (
              <button
                key={f}
                onClick={() => setFreight(f)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  freight === f ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">PO Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any notes for this purchase order..."
            className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'text-gray-900' }) {
  return (
    <div className="min-w-[88px]">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function GroupTable({ group, setQty, remove }) {
  const groupQty = group.items.reduce((s, l) => s + (l.qty || 0), 0)
  const groupCost = group.items.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0)
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-gray-700">{group.label}</span>
        <div className="flex gap-6 text-xs text-gray-500">
          <span>Qty: <span className="font-semibold tabular-nums text-gray-800">{int(groupQty)}</span></span>
          <span>Cost: <span className="font-semibold tabular-nums text-gray-800">{money(groupCost)}</span></span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
            <th className="px-4 py-2">Component</th>
            <th className="px-3 py-2 text-right">Order Qty</th>
            <th className="px-3 py-2 text-right">Unit Cost</th>
            <th className="px-3 py-2 text-right">Line Total</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {group.items.map((l) => (
            <tr key={l.component}>
              <td className="px-4 py-2 font-medium text-gray-900">{l.component}</td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  min="0"
                  value={l.qty ?? ''}
                  onChange={(e) => setQty(l.component, e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm tabular-nums focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{money3(l.unitCost)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{money((l.qty || 0) * (l.unitCost || 0))}</td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => remove(l.component)} className="text-gray-300 hover:text-red-600" title="Remove from PO">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildEmailBody(groups, notes, freight, snapshotDate) {
  const lines = []
  lines.push(`BodyJ4You — Purchase Order`)
  lines.push(`Supplier: FAT WIN TRADING LIMITED (Bony)`)
  if (snapshotDate) lines.push(`Stock snapshot: ${snapshotDate}`)
  if (freight) lines.push(`Freight: ${freight}`)
  lines.push('')
  for (const g of groups) {
    lines.push(`${g.label}`)
    for (const it of g.items) {
      const total = (it.qty || 0) * (it.unitCost || 0)
      lines.push(`  - ${it.component}: ${intOr0(it.qty)} × $${(it.unitCost || 0).toFixed(3)} = $${total.toFixed(2)}`)
    }
    lines.push('')
  }
  const totalQty = groups.flatMap((g) => g.items).reduce((s, l) => s + (l.qty || 0), 0)
  const totalCost = groups.flatMap((g) => g.items).reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0)
  lines.push(`GRAND TOTAL: ${int(totalQty)} units · $${totalCost.toFixed(2)}`)
  if (notes && notes.trim()) {
    lines.push('')
    lines.push('Notes:')
    lines.push(notes.trim())
  }
  return lines.join('\n')
}
