#!/usr/bin/env python3
"""
Generate seo-dashboard/data/asin_map.json from the authoritative Monday-brief
catalog (automation/catalog.xlsx, sheet "Catalog").

This is the single source of truth for grouping: every child ASIN -> its SKU,
its parent family (the catalog's "Parent ASIN" master, e.g. HS0002-Master), the
category, and the catalog Order (used to pick each family's base/primary item).

Run this whenever automation/catalog.xlsx changes. It needs openpyxl:
    pip install openpyxl
The committed asin_map.json lets build_returns.py run without openpyxl.
"""
import json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent.parent          # repo root
XLSX = ROOT / "automation" / "catalog.xlsx"
OUT = ROOT / "seo-dashboard" / "data" / "asin_map.json"


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb["Catalog"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = list(rows[0])
    col = {h: i for i, h in enumerate(hdr)}

    out = {}
    for r in rows[1:]:
        asin = r[col["ASIN"]]
        if not asin:
            continue
        family = r[col["Parent ASIN"]] or asin
        out[str(asin)] = {
            "sku": r[col["SKU"]],
            "family": str(family),
            "cat": r[col["Category"]],
            "order": r[col["Order"]],
        }

    OUT.write_text(json.dumps(out, indent=2))
    fams = {v["family"] for v in out.values()}
    print(f"Wrote {OUT} — {len(out)} ASINs across {len(fams)} families.")


if __name__ == "__main__":
    main()
