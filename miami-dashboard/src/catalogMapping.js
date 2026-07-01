import * as XLSX from 'xlsx';

// Resolve display SKU → FBA SKU on the dashboard side.
//
// The skill also writes an FBA SKU column in the Drive xlsx, but that file
// only refreshes when the Action runs. By bundling catalog.xlsx with the
// dashboard we make the mapping authoritative and immediate — every manifest
// download uses the current catalog, no waiting for a workflow run.
//
// catalog.xlsx is a copy of automation/catalog.xlsx, served from /catalog.xlsx.

const CATALOG_PATH = `${import.meta.env.BASE_URL}catalog.xlsx`;
const SHEET_NAME = 'Catalog';

let _cachePromise = null;

export function loadCatalogMap() {
  if (!_cachePromise) {
    _cachePromise = (async () => {
      const res = await fetch(CATALOG_PATH);
      if (!res.ok) {
        throw new Error(`Could not load catalog (${res.status}). Expected at ${CATALOG_PATH}`);
      }
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[SHEET_NAME];
      if (!ws) {
        throw new Error(`Catalog missing "${SHEET_NAME}" sheet. Found: ${wb.SheetNames.join(', ')}`);
      }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      const map = new Map();
      for (const r of rows) {
        const sku = r.SKU;
        const fba = r['FBA SKU'];
        if (sku && fba) map.set(String(sku), String(fba));
      }
      return map;
    })().catch((e) => {
      // Reset cache on failure so a later attempt can retry.
      _cachePromise = null;
      throw e;
    });
  }
  return _cachePromise;
}

// Resolve the FBA SKU we should ship to Amazon for a given display SKU.
// STEEL items already show the FBA kit SKU as their display SKU — those
// won't appear in the catalog as a SKU column entry, so we fall back to
// the display SKU itself, which is already the correct Merchant SKU.
export function resolveFbaSku(displaySku, catalogMap) {
  if (!displaySku) return displaySku;
  const mapped = catalogMap.get(String(displaySku));
  return mapped || displaySku;
}
