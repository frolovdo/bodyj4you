import { useEffect, useMemo, useState } from 'react'
import { parseWorkbook } from './parseFile.js'
import { loadManifest, loadSnapshot } from './driveLoader.js'
import { countByStatus, STATUSES } from './lib/status.js'
import Sidebar from './components/Sidebar.jsx'
import MiamiStockView from './components/MiamiStockView.jsx'
import InboundPOsView from './components/InboundPOsView.jsx'
import ShipmentsByWeekView from './components/ShipmentsByWeekView.jsx'
import ShipmentsView from './components/ShipmentsView.jsx'
import NewPOView from './components/NewPOView.jsx'
import FileSelector from './components/FileSelector.jsx'

function snapshotFrom(file, data) {
  if (file?.snapshotDate) {
    const d = new Date(file.snapshotDate + 'T00:00:00')
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  const sub = data?.miami?.subtitle
  if (typeof sub === 'string') {
    const m = sub.match(/^[A-Za-z]+ \d{1,2}, \d{4}/)
    if (m) return m[0]
  }
  return file?.label || ''
}

export default function App() {
  const [manifest, setManifest] = useState(null)
  const [manifestError, setManifestError] = useState('')
  const [selected, setSelected] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [nav, setNav] = useState('Miami Stock')

  // PO cart — keyed by component name, snapshot-scoped (cleared on snapshot switch).
  const [cart, setCart] = useState(new Map())
  const [notes, setNotes] = useState('')
  const [freight, setFreight] = useState('Ocean')

  // Local shipments — in memory only, survives navigation, wiped on full reload.
  const [shipments, setShipments] = useState([])

  // 1. Load manifest on mount.
  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then((m) => { if (!cancelled) { setManifest(m); setSelected(m.latest || (m.files?.[0]?.filename ?? '')) } })
      .catch((e) => { if (!cancelled) setManifestError(e.message) })
    return () => { cancelled = true }
  }, [])

  // 2. Fetch + parse on snapshot change.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setLoadError('')
    loadSnapshot(selected)
      .then((buf) => {
        if (cancelled) return
        setData(parseWorkbook(buf))
        setCart(new Map())
      })
      .catch((e) => { if (!cancelled) setLoadError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  function addToCart(item) {
    setCart((prev) => {
      const next = new Map(prev)
      next.set(item.component, {
        component: item.component,
        unitCost: item.unit_cost || 0,
        qty: item.reorder_qty && item.reorder_qty > 0 ? item.reorder_qty : 0,
      })
      return next
    })
  }
  const setQty = (component, qty) =>
    setCart((prev) => {
      const next = new Map(prev)
      const l = next.get(component)
      if (l) next.set(component, { ...l, qty })
      return next
    })
  const remove = (component) => setCart((prev) => { const n = new Map(prev); n.delete(component); return n })
  const clear = () => setCart(new Map())

  function createShipment(lines, meta) {
    const live = lines.filter((l) => l.qty && l.qty > 0)
    if (!live.length) { alert('Enter a ship quantity for at least one item.'); return }
    const id = `sh_${Date.now()}`
    const name = `Shipment ${shipments.length + 1}`
    setShipments((prev) => [{
      id, name, status: 'INBOUND', createdAt: Date.now(),
      freight: meta?.freight || freight, notes: meta?.notes || notes,
      lines: live.map((l) => ({ component: l.component, qty: l.qty, unitCost: l.unitCost })),
    }, ...prev])
    clear()
    setNav('Shipments')
  }
  const markReceived = (id) => setShipments((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'RECEIVED' } : s)))
  const deleteShipment = (id) => setShipments((prev) => prev.filter((s) => s.id !== id))

  const currentFile = manifest?.files?.find((f) => f.filename === selected)
  const snapshot = snapshotFrom(currentFile, data)
  const statusCounts = useMemo(() => (data ? countByStatus(data.miami.items) : null), [data])

  return (
    <div className="flex h-screen">
      <Sidebar
        active={nav}
        onNavigate={setNav}
        cartCount={cart.size}
        footer={
          manifest?.files?.length > 0 ? (
            <FileSelector
              files={manifest.files}
              selected={selected}
              onSelect={setSelected}
              syncedAt={manifest.syncedAt}
            />
          ) : null
        }
      />

      <main className="flex flex-1 flex-col overflow-hidden bg-[#F8F9FA]">
        <TopBar nav={nav} snapshot={snapshot} statusCounts={statusCounts} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] px-6 py-5">
            {renderBody({
              manifest, manifestError, loading, loadError, data, nav, snapshot,
              cart, addToCart, setQty, remove, clear, notes, setNotes, freight, setFreight,
              shipments, createShipment, markReceived, deleteShipment,
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

function TopBar({ nav, snapshot, statusCounts }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Miami Warehouse</div>
        <div className="text-base font-semibold text-gray-900">{nav}</div>
      </div>
      <div className="flex items-center gap-4">
        {statusCounts && (
          <div className="flex items-center gap-3 text-xs">
            {['Critical', 'Urgent', 'Order'].map((k) => {
              const s = STATUSES.find((x) => x.key === k)
              return (
                <span key={k} className="inline-flex items-center gap-1.5 text-gray-600">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  <span className="tabular-nums font-semibold text-gray-800">{statusCounts[k]}</span>
                  <span className="text-gray-500">{s.label}</span>
                </span>
              )
            })}
          </div>
        )}
        {snapshot && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
            Snapshot: <span className="font-semibold text-gray-800">{snapshot}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function renderBody(p) {
  if (p.manifestError) return <ErrorBox title="Manifest unavailable" body={p.manifestError} hint='Run "npm run sync" locally, or trigger the Sync Drive GitHub Action.' />
  if (!p.manifest) return <Center>Loading manifest…</Center>
  if (!p.manifest.files?.length) return <ErrorBox title="No snapshots yet" body={`Drive folder ${p.manifest.folderId} doesn't contain any "Miami Warehouse" file.`} tone="amber" />
  if (p.loading) return <Center>Loading snapshot {p.snapshot}…</Center>
  if (p.loadError) return <ErrorBox title="Failed to load snapshot" body={p.loadError} />
  if (!p.data) return <Center>Pick a snapshot.</Center>

  switch (p.nav) {
    case 'Miami Stock':
      return <MiamiStockView items={p.data.miami.items} totalReorderCost={p.data.miami.totalReorderCost} cart={p.cart} addToCart={p.addToCart} />
    case 'Inbound POs':
      return <InboundPOsView pos={p.data.inbound.pos} total={p.data.inbound.total} />
    case 'Shipments':
      return (
        <div className="space-y-6">
          <ShipmentsView shipments={p.shipments} onMarkReceived={p.markReceived} onDelete={p.deleteShipment} />
          {p.data.shipments.rows.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Historical shipments by week (from the file)</h3>
              <ShipmentsByWeekView weeks={p.data.shipments.weeks} rows={p.data.shipments.rows} />
            </div>
          )}
        </div>
      )
    case 'New PO':
      return (
        <NewPOView
          cart={p.cart} setQty={p.setQty} remove={p.remove} clear={p.clear}
          notes={p.notes} setNotes={p.setNotes}
          freight={p.freight} setFreight={p.setFreight}
          snapshotDate={p.snapshot}
          onCreateShipment={p.createShipment}
        />
      )
    default:
      return null
  }
}

function Center({ children }) { return <div className="flex items-center justify-center py-20 text-sm text-gray-500">{children}</div> }

function ErrorBox({ title, body, hint, tone = 'red' }) {
  const palettes = {
    red:   { border: 'border-red-200',   bg: 'bg-red-50',   title: 'text-red-700',   body: 'text-red-600',   hint: 'text-red-500'   },
    amber: { border: 'border-amber-200', bg: 'bg-amber-50', title: 'text-amber-700', body: 'text-amber-700', hint: 'text-amber-700' },
  }
  const p = palettes[tone] || palettes.red
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className={`rounded-xl border p-6 ${p.border} ${p.bg}`}>
        <div className={`mb-2 text-sm font-semibold ${p.title}`}>{title}</div>
        <div className={`text-sm ${p.body}`}>{body}</div>
        {hint && <div className={`mt-3 text-xs ${p.hint}`}>{hint}</div>}
      </div>
    </div>
  )
}
