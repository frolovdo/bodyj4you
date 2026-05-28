import { useEffect, useState } from 'react'
import { parseWorkbook } from './parseFile.js'
import { loadManifest, loadSnapshot } from './driveLoader.js'
import MiamiStockView from './components/MiamiStockView.jsx'
import InboundPOsView from './components/InboundPOsView.jsx'
import ShipmentsByWeekView from './components/ShipmentsByWeekView.jsx'
import POCart from './components/POCart.jsx'
import FileSelector from './components/FileSelector.jsx'

const TABS = ['Miami Stock', 'Inbound POs', 'Shipments by Week']

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
  const [tab, setTab] = useState('Miami Stock')

  const [cart, setCart] = useState(new Map())
  const [notes, setNotes] = useState('')
  const [freight, setFreight] = useState('Ocean')

  // 1. Load manifest on mount.
  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then((m) => { if (!cancelled) { setManifest(m); setSelected(m.latest || (m.files?.[0]?.filename ?? '')) } })
      .catch((e) => { if (!cancelled) setManifestError(e.message) })
    return () => { cancelled = true }
  }, [])

  // 2. Whenever the selected filename changes, fetch + parse that snapshot.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setLoadError('')
    loadSnapshot(selected)
      .then((buf) => {
        if (cancelled) return
        const parsed = parseWorkbook(buf)
        setData(parsed)
        setCart(new Map())   // cart is snapshot-specific (unit costs may change)
        setTab('Miami Stock')
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
  const remove = (component) =>
    setCart((prev) => { const next = new Map(prev); next.delete(component); return next })
  const clear = () => setCart(new Map())

  const currentFile = manifest?.files?.find((f) => f.filename === selected)
  const snapshot = snapshotFrom(currentFile, data)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 bg-[#1F2937] px-6 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold">B</div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">BodyJ4You Supply Chain</h1>
          <p className="text-xs text-gray-400">Miami Warehouse · Purchase Order Builder</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {manifest?.files?.length > 0 && (
            <FileSelector
              files={manifest.files}
              selected={selected}
              onSelect={setSelected}
              syncedAt={manifest.syncedAt}
            />
          )}
        </div>
      </header>

      {/* Body */}
      {manifestError ? (
        <ManifestError message={manifestError} />
      ) : !manifest ? (
        <Center>Loading manifest…</Center>
      ) : !manifest.files?.length ? (
        <EmptyManifest folderId={manifest.folderId} />
      ) : loading ? (
        <Center>Loading snapshot {snapshot || selected}…</Center>
      ) : loadError ? (
        <Center tone="error">{loadError}</Center>
      ) : !data ? (
        <Center>Pick a snapshot.</Center>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden">
            <nav className="flex gap-1 border-b border-gray-200 bg-white px-6">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
              <span className="ml-auto self-center text-xs text-gray-400">
                {snapshot && <>Snapshot: <span className="font-semibold text-gray-700">{snapshot}</span></>}
              </span>
            </nav>
            <div className="flex-1 overflow-y-auto bg-[#F8F9FA] p-6">
              <div className="mx-auto max-w-[1600px]">
                {tab === 'Miami Stock' && (
                  <MiamiStockView items={data.miami.items} totalReorderCost={data.miami.totalReorderCost} cart={cart} addToCart={addToCart} />
                )}
                {tab === 'Inbound POs' && <InboundPOsView pos={data.inbound.pos} total={data.inbound.total} />}
                {tab === 'Shipments by Week' && <ShipmentsByWeekView weeks={data.shipments.weeks} rows={data.shipments.rows} />}
              </div>
            </div>
          </main>
          <POCart
            cart={cart}
            setQty={setQty}
            remove={remove}
            clear={clear}
            notes={notes}
            setNotes={setNotes}
            freight={freight}
            setFreight={setFreight}
            snapshotDate={snapshot}
          />
        </div>
      )}
    </div>
  )
}

function Center({ children, tone }) {
  const t = tone === 'error' ? 'text-red-600' : 'text-gray-500'
  return <div className={`flex flex-1 items-center justify-center text-sm ${t}`}>{children}</div>
}

function ManifestError({ message }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="mb-2 text-sm font-semibold text-red-700">Manifest unavailable</div>
        <div className="text-sm text-red-600">{message}</div>
        <div className="mt-3 text-xs text-red-500">
          Run <code className="rounded bg-red-100 px-1 py-0.5">npm run sync</code> locally,
          or trigger the <strong>Sync Drive</strong> GitHub Action.
        </div>
      </div>
    </div>
  )
}

function EmptyManifest({ folderId }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="mb-2 text-sm font-semibold text-amber-700">No snapshots yet</div>
        <div className="text-sm text-amber-700">
          The Drive folder <span className="font-mono text-xs">{folderId}</span> doesn't contain any
          file matching <code className="rounded bg-amber-100 px-1 py-0.5">Miami Warehouse</code>.
        </div>
        <ol className="mt-3 list-decimal pl-5 text-xs text-amber-700">
          <li>Drop a weekly <code className="font-mono">Miami Warehouse - MM.DD.YY.xlsx</code> into the folder.</li>
          <li>Wait for the next scheduled sync, or run <code className="font-mono">npm run sync</code>.</li>
        </ol>
      </div>
    </div>
  )
}
