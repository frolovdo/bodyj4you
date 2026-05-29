// Dark left sidebar, 224px wide, fixed full-height. Active nav row gets the
// blue accent treatment.

const NAV = [
  { key: 'Miami Stock', icon: IconHome },
  { key: 'Inbound POs', icon: IconTruck },
  { key: 'Shipments',   icon: IconBox },
  { key: 'New PO',      icon: IconList },
]

export default function Sidebar({ active, onNavigate, cartCount, footer }) {
  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col bg-[#0F1117] text-gray-300">
      <div className="px-5 pt-6 pb-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Supply Chain</div>
        <div className="text-base font-semibold text-white">BodyJ4You Dashboard</div>
      </div>
      <nav className="flex-1 px-2">
        {NAV.map((n) => {
          const Icon = n.icon
          const isActive = n.key === active
          return (
            <button
              key={n.key}
              onClick={() => onNavigate(n.key)}
              className={`mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">{n.key}</span>
              {n.key === 'New PO' && cartCount > 0 && (
                <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{cartCount}</span>
              )}
            </button>
          )
        })}
      </nav>
      {footer && <div className="border-t border-white/10 px-4 py-3">{footer}</div>}
    </aside>
  )
}

function IconHome(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l9-9 9 9M5 10v10h14V10" />
    </svg>
  )
}
function IconTruck(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4h14v12H1zM15 8h5l3 3v5h-8z" />
      <circle cx="5.5" cy="18" r="1.5" /><circle cx="18.5" cy="18" r="1.5" />
    </svg>
  )
}
function IconBox(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73L13 2.27a2 2 0 00-2 0L4 6.27A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  )
}
function IconList(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
    </svg>
  )
}
