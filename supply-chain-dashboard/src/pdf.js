import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, money3, int } from './lib/format.js'

export const SUPPLIER = 'FAT WIN TRADING LIMITED (Bony)'

export function exportPO({ items, notes, freight, snapshotDate }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const M = 40
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('BodyJ4You  —  Purchase Order', M, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`Supplier: ${SUPPLIER}`, M, 68)
  doc.text(`Date: ${today}`, M, 82)
  if (freight) doc.text(`Freight: ${freight}`, M, 96)
  if (snapshotDate) doc.text(`Stock snapshot: ${snapshotDate}`, pageW - M, 68, { align: 'right' })
  doc.setTextColor(0)

  const body = items.map((it) => [
    it.component,
    int(it.qty),
    money3(it.unitCost),
    money(it.qty * it.unitCost),
  ])
  const grand = items.reduce((s, it) => s + it.qty * it.unitCost, 0)

  autoTable(doc, {
    startY: freight ? 112 : 100,
    head: [['Component', 'Order Qty', 'Unit Cost', 'Line Total']],
    body,
    foot: [['', '', 'Grand Total', money(grand)]],
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 10 },
    footStyles: { fillColor: [243, 244, 246], textColor: 17, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: M, right: M },
  })

  let y = doc.lastAutoTable.finalY + 24
  if (notes && notes.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Notes:', M, y)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(notes.trim(), pageW - M * 2)
    doc.text(lines, M, y + 14)
  }

  const stamp = today.replace(/[ ,]/g, '_')
  doc.save(`BodyJ4You_PO_${stamp}.pdf`)
}
