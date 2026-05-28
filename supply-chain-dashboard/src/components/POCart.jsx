import { money, money3 } from '../lib/format.js'
import { exportPO, SUPPLIER } from '../pdf.js'

const FREIGHTS = ['Ocean', 'Air', 'US']

export default function POCart({ cart, setQty, remove, clear, notes, setNotes, freight, setFreight, snapshotDate }) {
  const lines = Array.from(cart.values())
  const grand = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0)

  function handleExport() {
    const items = lines.filter((l) => l.qty && l.qty > 0).map((l) => ({ component: l.component, qty: l.qty, unitCost: l.unitCost || 0 }))
    if (!items.length) {
      alert('Enter a ship quantity for at least one item.')
      return
    }
    exportPO({ items, notes, freight, snapshotDate })
  }

  return (
    <aside className="flex h-full w-80 flex-shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="font-semibold text-gray-900">Purchase Order</h2>
          <p className="text-xs text-gray-500">{SUPPLIER}</p>
        </div>
        {lines.length > 0 && (
          <button onClick={clear} className="text-xs text-gray-400 hover:text-red-600">Clear All</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {lines.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-gray-500">No items added yet</p>
            <p className="mt-1 text-xs text-gray-400">Go to Miami Stock to add items to your PO</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.component} className="rounded-lg border border-gray-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{l.component}</span>
                  <button onClick={() => remove(l.component)} className="text-gray-300 hover:text-red-600" title="Remove from PO">×</button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <input
                    type="number"
                    min="0"
                    value={l.qty ?? ''}
                    onChange={(e) => setQty(l.component, e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">× {money3(l.unitCost)}</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{money((l.qty || 0) * (l.unitCost || 0))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 p-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Freight Type</label>
          <div className="flex gap-1.5">
            {FREIGHTS.map((f) => (
              <button
                key={f}
                onClick={() => setFreight(f)}
                className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                  freight === f ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">PO Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add any notes for this purchase order..."
            className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Grand Total</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">{money(grand)}</span>
        </div>
        <button
          onClick={handleExport}
          disabled={lines.length === 0}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          Export PDF
        </button>
      </div>
    </aside>
  )
}
