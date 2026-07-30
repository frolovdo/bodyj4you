#!/usr/bin/env python3
"""
Generate data/asin_map.json from the catalog workbook committed at
bodyj4you-return-dashboard/data/catalog.xlsx (sheet "Active").

Catalog format (Catalog_MM.DD.YYYY.xlsx from Denis):
  SKU | ASIN | (Parent) ASIN | Category | FBA SKU | Warehouse

This is the single source of truth for grouping: every child ASIN -> its SKU,
its parent family (the "(Parent) ASIN" master, e.g. HS0002-Master), the
category, and its row order (first row of a family = flagship/base item).

Run whenever the catalog changes (drop the new file over data/catalog.xlsx).
Needs openpyxl (pip install openpyxl). The committed asin_map.json lets
build_returns.py run without openpyxl.
"""
import json
from pathlib import Path
import openpyxl

DATA = Path(__file__).resolve().parent.parent / "data"
XLSX = DATA / "catalog.xlsx"
OUT = DATA / "asin_map.json"


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb["Active"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = list(rows[0])
    col = {h: i for i, h in enumerate(hdr)}
    parent_col = "(Parent) ASIN" if "(Parent) ASIN" in col else "Parent ASIN"

    out = {}
    for order, r in enumerate(rows[1:], start=1):
        asin = r[col["ASIN"]]
        if not asin:
            continue
        family = r[col[parent_col]] or asin
        out[str(asin).strip()] = {
            "sku": str(r[col["SKU"]]).strip() if r[col["SKU"]] else str(asin),
            "family": str(family).strip(),
            "cat": (r[col["Category"]] or "").strip(),
            "order": order,          # sheet order; first of a family = flagship
        }

    OUT.write_text(json.dumps(out, indent=2))
    fams = {v["family"] for v in out.values()}
    print(f"Wrote {OUT} — {len(out)} ASINs across {len(fams)} families.")


if __name__ == "__main__":
    main()
