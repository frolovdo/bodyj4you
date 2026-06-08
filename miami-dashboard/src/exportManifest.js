import * as XLSX from 'xlsx';

// Build the Amazon "Send to Amazon" manifest xlsx for the Miami shipment.
//
// We DO NOT generate the workbook from scratch. We load the official Amazon
// template (ManifestFileUpload_Template_MPL.xlsx — copy provided by the user,
// served as a static asset from /) and only write the Merchant SKU + Quantity
// values into the "Create workflow – template" sheet starting at row 7.
// Every other sheet (Instructions, Data definitions, Create workflow – example)
// and every other cell stays byte-equivalent to the source template.
//
// We write item.fbaSku (the actual Merchant SKU from catalog.xlsx) into
// column A, NOT the display SKU shown in the dashboard. For non-STEEL items
// these may differ, and the manifest must use the FBA SKU so Amazon's
// receiving matches the right product.

const TEMPLATE_PATH = `${import.meta.env.BASE_URL}ManifestFileUpload_Template_MPL.xlsx`;
const SHEET_NAME = 'Create workflow – template'; // U+2013 en-dash, exact match required

export async function buildManifestWorkbook(cart) {
  const res = await fetch(TEMPLATE_PATH);
  if (!res.ok) {
    throw new Error(`Could not load manifest template (${res.status}). Expected at ${TEMPLATE_PATH}`);
  }
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(`Template is missing the "${SHEET_NAME}" sheet. Found: ${wb.SheetNames.join(', ')}`);
  }

  // Row 6 (1-indexed) holds the headers "Merchant SKU" / "Quantity".
  // We write our data starting at row 7 — origin 'A7'.
  const dataRows = cart.map((item) => [item.fbaSku, Number(item.quantity) || 0]);
  XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: 'A7' });

  return wb;
}

export async function exportManifest(cart) {
  const wb = await buildManifestWorkbook(cart);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `Miami_FBA_Shipment_${date}.xlsx`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { SHEET_NAME as MANIFEST_SHEET_NAME };
