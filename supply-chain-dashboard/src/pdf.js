import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, money3, int, intOr0 } from './lib/format.js'
import { groupByFamily } from './lib/families.js'

export const SUPPLIER = 'FAT WIN TRADING LIMITED (Bony)'

// PDF layout per the handoff doc:
//   1. Dark brand header bar (#0F1117), full-width, ~75pt tall
//   2. Summary line under it (N line items · X units · Y groups)
//   3. One unified table — group header rows (gray) + item rows
//   4. Dark grand-total footer row (matches the header)
//   5. Optional notes block
//   6. Page footer on every page: BodyJ4You Supply Chain · {date} · Page X of Y

const DARK = [15, 17, 23]            // #0F1117
const GRAY_FILL = [243, 244, 246]    // #F3F4F6  group header
const ALT_FILL = [252, 252, 253]     // #FCFCFD  alt rows
const MUTED = [120, 120, 130]

export function exportPO({ items, notes, freight, snapshotDate, groups }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 32
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const gs = groups || groupByFamily(items.map((i) => ({ ...i, component: i.component })))
  const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0)
  const totalCost = items.reduce((s, i) => s + (i.qty || 0) * (i.unitCost || 0), 0)

  drawHeader(doc, W, today, snapshotDate, freight)

  // Summary line
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(
    `${items.length} line item${items.length === 1 ? '' : 's'}  ·  ${intOr0(totalQty)} total units  ·  ${gs.length} group${gs.length === 1 ? '' : 's'}`,
    M, 95
  )
  doc.setTextColor(0)

  // Build unified body — group header rows + item rows
  const body = []
  for (const g of gs) {
    const gQty = g.items.reduce((s, l) => s + (l.qty || 0), 0)
    const gCost = g.items.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0)
    body.push([
      { content: g.label.toUpperCase(), colSpan: 3, styles: { fillColor: GRAY_FILL, textColor: 40, fontStyle: 'bold', fontSize: 9 } },
      { content: intOr0(gQty),  styles: { fillColor: GRAY_FILL, textColor: 40, fontStyle: 'bold', halign: 'right' } },
      { content: money(gCost),  styles: { fillColor: GRAY_FILL, textColor: 40, fontStyle: 'bold', halign: 'right' } },
    ])
    for (const it of g.items) {
      body.push([
        it.component,
        { content: int(it.suggested), styles: { textColor: MUTED, halign: 'right' } },
        { content: intOr0(it.qty), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: money3(it.unitCost), styles: { textColor: MUTED, halign: 'right' } },
        { content: money((it.qty || 0) * (it.unitCost || 0)), styles: { fontStyle: 'bold', halign: 'right' } },
      ])
    }
  }

  autoTable(doc, {
    startY: 105,
    head: [['Component', 'Suggested', 'Order Qty', 'Unit Cost', 'Line Total']],
    body,
    foot: [[
      { content: 'GRAND TOTAL', colSpan: 2, styles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', halign: 'left' } },
      { content: intOr0(totalQty), styles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', halign: 'right' } },
      { content: '', styles: { fillColor: DARK, textColor: 255 } },
      { content: money(totalCost), styles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', halign: 'right' } },
    ]],
    theme: 'plain',
    headStyles: { fillColor: DARK, textColor: 255, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, lineColor: [230, 230, 235], lineWidth: 0.5 },
    alternateRowStyles: { fillColor: ALT_FILL },
    margin: { left: M, right: M, top: 105, bottom: 60 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 70, halign: 'right' },
      2: { cellWidth: 70, halign: 'right' },
      3: { cellWidth: 70, halign: 'right' },
      4: { cellWidth: 80, halign: 'right' },
    },
    didDrawPage: () => drawPageFooter(doc, W, H, today),
  })

  let y = doc.lastAutoTable.finalY + 22
  if (notes && notes.trim()) {
    if (y > H - 100) { doc.addPage(); drawPageFooter(doc, W, H, today); y = M }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(40)
    doc.text('Notes', M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(70)
    const lines = doc.splitTextToSize(notes.trim(), W - M * 2)
    doc.text(lines, M, y + 14)
  }

  const stamp = today.replace(/[ ,]/g, '_')
  doc.save(`BodyJ4You_PO_${stamp}.pdf`)
}

function drawHeader(doc, W, today, snapshotDate, freight) {
  const H = 75
  // Dark band
  doc.setFillColor(...DARK)
  doc.rect(0, 0, W, H, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255)
  doc.text('BodyJ4You  —  Purchase Order', 32, 36)

  // Meta line
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180)
  doc.text(SUPPLIER, 32, 55)

  // Right-aligned date + freight
  doc.setFontSize(9)
  doc.setTextColor(180)
  const right = []
  right.push(`Date: ${today}`)
  if (snapshotDate) right.push(`Stock snapshot: ${snapshotDate}`)
  if (freight) right.push(`Freight: ${freight}`)
  let y = 28
  for (const line of right) {
    doc.text(line, W - 32, y, { align: 'right' })
    y += 12
  }
  doc.setTextColor(0)
}

function drawPageFooter(doc, W, H, today) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(150)
  const pageNo = doc.getCurrentPageInfo().pageNumber
  const pageCount = doc.getNumberOfPages()
  doc.text(`BodyJ4You Supply Chain  ·  ${today}`, 32, H - 24)
  doc.text(`Page ${pageNo} of ${pageCount}`, W - 32, H - 24, { align: 'right' })
  doc.setTextColor(0)
}
