import { useState, useRef, useEffect } from 'react'

function fmtBytes(n) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Lives in the sidebar footer. Full-width dark-themed trigger; popover opens
// upward (sidebar footer is at the bottom of the viewport).
export default function FileSelector({ files, selected, onSelect, syncedAt }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = files.find((f) => f.filename === selected)
  const label = current ? (current.label || current.displayName || current.filename) : 'Select a file'
  const isLatest = current && files[0] && current.filename === files[0].filename

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 hover:bg-white/10"
      >
        <span className="flex min-w-0 flex-col text-left">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Snapshot</span>
          <span className="flex items-center gap-1.5 truncate font-semibold text-white">
            {label}
            {isLatest && <span className="rounded bg-green-500/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-300">Latest</span>}
          </span>
        </span>
        <svg className="h-3 w-3 flex-shrink-0 opacity-60" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 12.5l4.5-4.5 4.5 4.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-800 shadow-2xl">
          <div className="border-b border-gray-100 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400">
            Archive · {files.length} file{files.length === 1 ? '' : 's'}{syncedAt ? ` · synced ${new Date(syncedAt).toLocaleString()}` : ''}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {files.map((f, i) => {
              const active = f.filename === selected
              return (
                <li key={f.filename}>
                  <button
                    onClick={() => { onSelect(f.filename); setOpen(false) }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 ${active ? 'bg-blue-50' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{f.label || f.displayName || f.filename}</span>
                      <span className="block truncate text-xs text-gray-400">{f.displayName || f.filename}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2 text-xs text-gray-400">
                      {i === 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">LATEST</span>}
                      {fmtBytes(f.sizeBytes)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
