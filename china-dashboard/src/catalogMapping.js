import * as XLSX from 'xlsx';

// Resolve display SKU → FBA SKU on the dashboard side.
//
// catalog.xlsx is bundled with the dashboard and updates the moment a new
// catalog is deployed, without needing to wait for a workflow run.

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
      _cachePromise = null;
      throw e;
    });
  }
  return _cachePromise;
}

export function resolveFbaSku(displaySku, catalogMap) {
  if (!displaySku) return displaySku;
  const mapped = catalogMap.get(String(displaySku));
  return mapped || displaySku;
}
