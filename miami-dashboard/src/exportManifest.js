import * as XLSX from 'xlsx';

// Build the Amazon "Send to Amazon" manifest xlsx for the Miami shipment.
// Critical (and identical to the China side):
//   - Sheet name uses an en-dash (U+2013) between "workflow" and "template",
//     NOT a hyphen.
//   - Header row is row 6 (1-indexed). Data starts at row 7.
//   - Column A = Merchant SKU, Column B = Quantity.
// For Miami, the SKU we write into column A is item.sku — the skill already
// substituted the FBA kit SKU for STEEL items before writing the spreadsheet,
// so the cart's `sku` field is the right thing to ship.

const SHEET_NAME = 'Create workflow – template'; // U+2013 en-dash

export function buildManifestWorkbook(cart) {
  const rows = [];
  rows[0] = ['Send to Amazon manifest — generated from Miami Monday Reorder'];
  rows[1] = [];
  rows[2] = [];
  rows[3] = [];
  rows[4] = [];
  rows[5] = ['Merchant SKU', 'Quantity'];
  cart.forEach((item, i) => {
    rows[6 + i] = [item.sku, Number(item.quantity) || 0];
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return wb;
}

export function exportManifest(cart) {
  const wb = buildManifestWorkbook(cart);
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Miami_FBA_Shipment_${date}.xlsx`);
}

export { SHEET_NAME as MANIFEST_SHEET_NAME };
