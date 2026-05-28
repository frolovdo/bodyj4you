import * as XLSX from 'xlsx'

// The skill-generated "Miami Warehouse - MM.DD.YY.xlsx" has a fixed layout:
//   - column A is an empty 3-width spacer (so real data starts at column B / index 1)
//   - row 1 title, row 2 subtitle, row 3 blank, row 4 headers, row 5+ data
// We locate the header row by its first label instead of hard-coding row 4,
// so a shifted template still parses.

function rows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true })
}

function findHeaderRow(grid, firstLabel) {
  for (let i = 0; i < grid.length; i++) {
    const cell = grid[i] && grid[i][1]
    if (typeof cell === 'string' && cell.trim().toLowerCase() === firstLabel.toLowerCase()) return i
  }
  return -1
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseMiamiStock(ws) {
  const grid = rows(ws)
  const subtitle = grid[1] ? grid[1][1] : null
  const h = findHeaderRow(grid, 'component')
  const items = []
  if (h === -1) return { subtitle, items, totalReorderCost: 0 }
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r]
    const name = row && row[1]
    if (!name) continue
    if (String(name).toUpperCase().startsWith('TOTAL')) break
    items.push({
      component: String(name),
      on_hand: num(row[2]),
      inbound_miami: num(row[3]),
      daily_velocity: num(row[4]),
      target_days: num(row[5]),
      days_covered: num(row[6]),
      reorder_qty: num(row[7]),
      unit_cost: num(row[8]),
      reorder_cost: num(row[9]),
    })
  }
  const totalReorderCost = items.reduce((s, i) => s + (i.reorder_cost || 0), 0)
  return { subtitle, items, totalReorderCost }
}

const BANNER = '●' // ●

function parseInboundPOs(ws) {
  const grid = rows(ws)
  const subtitle = grid[1] ? grid[1][1] : null
  const h = findHeaderRow(grid, 'PO Name')
  const pos = []
  if (h === -1) return { subtitle, pos, total: 0 }
  let current = null
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r]
    const poName = row && row[1]
    const comp = row && row[5]
    if (!poName && !comp) continue
    if (typeof poName === 'string' && poName.toUpperCase().startsWith('TOTAL')) break

    const isBanner = typeof comp === 'string' && comp.trim().startsWith(BANNER)
    if (isBanner) {
      current = {
        name: poName || '',
        shipped: row[2] || '',
        eta: row[3] || '',
        freight: row[4] || '',
        status: comp.replace(BANNER, '').trim(),
        subtotal: num(row[8]) || 0,
        lines: [],
      }
      pos.push(current)
    } else if (current && comp) {
      current.lines.push({
        component: String(comp),
        qty: num(row[6]),
        unitCost: num(row[7]),
        lineTotal: num(row[8]),
      })
    }
  }
  const total = pos.reduce((s, p) => s + (p.subtotal || 0), 0)
  return { subtitle, pos, total }
}

function parseShipmentsByWeek(ws) {
  const grid = rows(ws)
  const subtitle = grid[1] ? grid[1][1] : null
  const h = findHeaderRow(grid, 'Component')
  if (h === -1) return { subtitle, weeks: [], rows: [] }
  const header = grid[h]
  const weeks = []
  let totalCol = -1
  for (let c = 2; c < header.length; c++) {
    const label = header[c]
    if (!label) continue
    if (String(label).toUpperCase() === 'TOTAL') { totalCol = c; continue }
    weeks.push({ col: c, label: String(label) })
  }
  const out = []
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r]
    const comp = row && row[1]
    if (!comp) continue
    if (String(comp).toUpperCase() === 'TOTAL') continue
    out.push({
      component: String(comp),
      cells: weeks.map((w) => num(row[w.col])),
      total: totalCol !== -1 ? num(row[totalCol]) : weeks.reduce((s, w) => s + (num(row[w.col]) || 0), 0),
    })
  }
  return { subtitle, weeks: weeks.map((w) => w.label), rows: out }
}

export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const get = (name) => wb.Sheets[name]
  if (!get('Miami Stock')) {
    throw new Error(
      'Could not find a "Miami Stock" sheet. Upload the weekly "Miami Warehouse - MM.DD.YY.xlsx" file produced by the component-reorder skill.'
    )
  }
  const miami = parseMiamiStock(get('Miami Stock'))
  const inbound = get('Inbound POs') ? parseInboundPOs(get('Inbound POs')) : { subtitle: null, pos: [], total: 0 }
  const shipments = get('Shipments by Week')
    ? parseShipmentsByWeek(get('Shipments by Week'))
    : { subtitle: null, weeks: [], rows: [] }
  return { miami, inbound, shipments, sheetNames: wb.SheetNames }
}
