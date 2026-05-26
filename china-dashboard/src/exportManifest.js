import * as XLSX from 'xlsx';

// Build the Amazon "Send to Amazon" manifest xlsx.
// Critical: the sheet name uses an en-dash (U+2013) between "workflow" and "template",
// NOT a hyphen. The header row is row 6 (1-indexed). Data starts at row 7.
// Column A = Merchant SKU (the FBA SKU from the cart), Column B = Quantity.
// The manifest must NEVER contain the display SKU.

const SHEET_NAME = 'Create workflow – template';   // U+2013 en-dash

export function buildManifestWorkbook(cart) {
  // Array-of-arrays so we control exact cell placement.
  // rows[0] is row 1; we put a one-line preamble there.
  // rows 1..4 (rows 2..5) are blank.
  // rows[5] is row 6 — the header.
  // rows[6+] are the data rows.
  const rows = [];
  rows[0] = ['Send to Amazon manifest — generated from China Weekly Reorder'];
  // Pad rows 2-5 with empty arrays so SheetJS doesn't collapse them.
  rows[1] = [];
  rows[2] = [];
  rows[3] = [];
  rows[4] = [];
  rows[5] = ['Merchant SKU', 'Quantity'];
  cart.forEach((item, i) => {
    rows[6 + i] = [item.fbaSku, Number(item.quantity) || 0];
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return wb;
}

export function exportManifest(cart) {
  const wb = buildManifestWorkbook(cart);
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FBA_Shipment_${date}.xlsx`);
}

export { SHEET_NAME as MANIFEST_SHEET_NAME };
