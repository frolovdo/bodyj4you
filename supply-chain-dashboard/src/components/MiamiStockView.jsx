import { useMemo, useState } from 'react'
import { money, money3, int, intOr0, vel } from '../lib/format.js'
import { STATUSES, statusOf, countByStatus } from '../lib/status.js'
import { groupByFamily, familyInitials } from '../lib/families.js'
import StatusPill from './StatusPill.jsx'
import CoverageBar from './CoverageBar.jsx'

const FILTER_BUCKETS = ['All', 'Critical', 'Urgent', 'Order', 'OK', 'No Demand']

export default function MiamiStockView({ items, totalReorderCost, cart, addToCart }) {
  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')

  const counts = useMemo(() => countByStatus(items), [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((it) => {
      if (filter !== 'All' && statusOf(it).key !== filter) return false
      if (needle && !it.component.toLowerCase().includes(needle)) return false
      return true
    })
  }, [items, filter, q])

  const groups = useMemo(() => groupByFamily(filtered), [filtered])

  return (
    <div className="space-y-5">
      {/* Five stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total Reorder Cost" value={money(totalReorderCost)} tone="text-gray-900" />
        {STATUSES.filter((s) => s.key !== 'No Demand').map((s) => (
          <StatCard key={s.key} label={s.label} value={counts[s.key]} sub={s.range} tone={`text-${s.tone}-600`} />
        ))}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-500">Filter:</span>
        {FILTER_BUCKETS.map((k) => {
          const s = STATUSES.find((x) => x.key === k)
          const isActive = filter === k
          const count = k === 'All' ? items.length : counts[k]
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-sm transition-all ${
                isActive
                  ? `${s ? s.bg : 'bg-gray-100'} ${s ? s.text : 'text-gray-900'} border-transparent ring-2 ring-offset-1 ring-gray-300`
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {k} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search component…"
          className="ml-auto w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
      </div>

      {/* Grouped rows */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400">No components match.</div>
      ) : (
        groups.map((g) => (
          <FamilySection key={g.key} group={g} cart={cart} addToCart={addToCart} />
        ))
      )}
    </div>
  )
}

function StatCard({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  )
}

function FamilySection({ group, cart, addToCart }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2">
        <div>
          <span className="text-sm font-semibold text-gray-800">{group.label}</span>
          <span className="ml-2 text-xs text-gray-400">{group.items.length} component{group.items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {group.items.map((it) => (
          <ComponentRow key={it.component} item={it} family={group.key} cart={cart} addToCart={addToCart} />
        ))}
      </div>
    </div>
  )
}

function ComponentRow({ item, family, cart, addToCart }) {
  const s = statusOf(item)
  const inCart = cart.has(item.component)
  const daysLabel = item.days_covered == null ? '—' : `${Math.round(item.days_covered)} days`
  const targetLabel = item.target_days ? `target ${item.target_days}` : ''

  return (
    <div className={`px-4 py-3 ${s.key === 'Critical' ? 'bg-red-50/40' : s.key === 'Urgent' ? 'bg-orange-50/30' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-gray-600 ${s.soft}`}>
          {familyInitials(family)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-gray-900">{item.component}</div>
            <StatusPill status={s} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-500">
            <span>on hand: <span className="font-semibold tabular-nums text-gray-700">{intOr0(item.on_hand)}</span></span>
            <span>inbound: <span className="font-semibold tabular-nums text-gray-700">{intOr0(item.inbound_miami)}</span></span>
            <span>velocity: <span className="font-semibold tabular-nums text-gray-700">{vel(item.daily_velocity)}</span>/day</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1"><CoverageBar item={item} /></div>
            <div className="w-28 text-right text-xs tabular-nums text-gray-500">
              <span className="font-semibold text-gray-700">{daysLabel}</span>
              {targetLabel && <span className="ml-1 text-gray-400">/ {targetLabel}</span>}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>Suggested: <span className="font-semibold tabular-nums text-gray-700">{int(item.reorder_qty)}</span></span>
            <span className="text-gray-300">·</span>
            <span>Unit: <span className="font-mono text-gray-700">{money3(item.unit_cost)}</span></span>
            <span className="text-gray-300">·</span>
            <span>Reorder cost: <span className="font-semibold tabular-nums text-gray-700">{money(item.reorder_cost)}</span></span>
            <button
              disabled={inCart}
              onClick={() => addToCart(item)}
              className={`ml-auto rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                inCart
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {inCart ? '✓ In PO' : '+ Add to PO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
