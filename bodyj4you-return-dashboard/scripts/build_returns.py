#!/usr/bin/env python3
"""
Build bodyj4you-return-dashboard/public/data/returns.json from the Helium 10
P&L pulls, grouped by the authoritative Monday-brief catalog.

Inputs (all under bodyj4you-return-dashboard/data/):
  asin_map.json       ASIN -> {sku, family, cat, order}  (from build_catalog.py)
  parent_meta.json    family -> {name, image}            (title + main image)
  asin_images.json    ASIN -> media id                   (per-variation thumb)
  raw/pnl_30d.json    30-day ASIN-level P&L from Helium 10 MCP
  raw/pnl_7d.json     last-7-day ASIN-level P&L from Helium 10 MCP

Output:
  public/data/returns.json

Design (per Denis's spec):
  * Group by catalog family (the "Parent ASIN" master, e.g. NC4285-Master).
  * Parent row = title + parent SKU (the family master) + parent ASIN (the
    flagship/base listing, linked to Amazon).
  * A variation is shown only if it SOLD last week (7-day units > 0).
  * A family is shown only if its last-week sales are substantial
    (>= MIN_SALES_7D) — keep the list short and actionable.
  * Order: by last-week revenue (7-day sales), biggest first — parents and
    variations alike, regardless of refund rate.
  * Columns: Sales = 7d, Refunds = 7d, Refund rate = 30-day average.

Metric: refund rate = refunded $ / sales $. Amazon units_returned is excluded
(FBA return-to-stock lag); the Refunded Amount sub-metric is the ground truth.
"""

import json
import datetime
from pathlib import Path

# ---- tunable thresholds -----------------------------------------------------
MIN_SALES_7D = 1500     # a family must have at least this much 7-day revenue
FLAG_RATE_30D = 5.0     # flag if 30-day refund rate >= this %
FLAG_DELTA_PP = 1.0     # ...and last week rose at least this many pp vs 30-day
FLAG_MIN_REFUND_7D = 25 # ...and it refunded at least this many $ last week
# -----------------------------------------------------------------------------

DATA = Path(__file__).resolve().parent.parent / "data"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "returns.json"

CAT_NAMES = {
    "PA": "Piercing Aftercare",
    "EO": "Essential & Carrier Oils",
    "GK": "Gauge / Stretching Kits",
    "NC": "Choker Necklaces",
    "PJ": "Piercing Jewelry",
    "FJ": "Fashion Jewelry",
}


def load(name):
    return json.loads((DATA / name).read_text())


def rate(refund, sales):
    return round(refund / sales * 100, 2) if sales else 0.0


def main():
    asin_map = load("asin_map.json")
    meta = load("parent_meta.json")
    fam_meta = meta["families"]
    img_base = meta["imageBase"]
    images = load("asin_images.json")["images"]
    w30 = load(Path("raw") / "pnl_30d.json")
    w7 = load(Path("raw") / "pnl_7d.json")

    by30 = {r["a"]: r for r in w30["rows"]}
    by7 = {r["a"]: r for r in w7["rows"]}
    all_asins = set(by30) | set(by7)

    def img_url(asin):
        return img_base + images[asin] if asin in images else None

    groups = {}
    for asin in all_asins:
        info = asin_map.get(asin, {"sku": asin, "family": asin, "cat": "", "order": 9999})
        groups.setdefault(info["family"], []).append(asin)

    parents_out = []
    kpi = {"s30": 0.0, "r30": 0.0, "s7": 0.0, "r7": 0.0}

    for family, children in groups.items():
        children.sort(key=lambda a: asin_map.get(a, {}).get("order", 9999))
        primary = children[0]                         # flagship / base listing
        cat = asin_map.get(primary, {}).get("cat", "")
        fmeta = fam_meta.get(family, {})
        name = fmeta.get("name") or asin_map.get(primary, {}).get("sku") or family
        image = img_base + fmeta["image"] if fmeta.get("image") else img_url(primary)

        agg = {"s30": 0.0, "r30": 0.0, "s7": 0.0, "r7": 0.0}
        child_rows = []
        for asin in children:
            r30 = by30.get(asin, {"u": 0, "s": 0.0, "r": 0.0})
            r7 = by7.get(asin, {"u": 0, "s": 0.0, "r": 0.0})
            # Aggregate the family from everything (so the 30-day rate is whole)...
            agg["s30"] += r30["s"]; agg["r30"] += r30["r"]
            agg["s7"] += r7["s"];  agg["r7"] += r7["r"]
            # ...but only SHOW variations that sold last week.
            if r7["u"] <= 0:
                continue
            info = asin_map.get(asin, {})
            child_rows.append({
                "asin": asin,
                "sku": info.get("sku", asin),
                "image": img_url(asin),
                "s7": round(r7["s"], 2), "r7": round(r7["r"], 2),
                "rate30": rate(r30["r"], r30["s"]),
                "rate7": rate(r7["r"], r7["s"]),
                "delta": round(rate(r7["r"], r7["s"]) - rate(r30["r"], r30["s"]), 2),
            })

        # Substantial-sellers only.
        if not child_rows or agg["s7"] < MIN_SALES_7D:
            continue

        rate30 = rate(agg["r30"], agg["s30"])
        rate7 = rate(agg["r7"], agg["s7"]) if agg["s7"] else None
        delta = round(rate7 - rate30, 2) if rate7 is not None else None
        flagged = bool(
            rate30 >= FLAG_RATE_30D
            and delta is not None and delta >= FLAG_DELTA_PP
            and agg["r7"] >= FLAG_MIN_REFUND_7D
        )

        child_rows.sort(key=lambda c: c["s7"], reverse=True)   # revenue first

        parents_out.append({
            "family": family,
            "sku": family,                 # parent SKU = catalog master
            "asin": primary,               # flagship ASIN (links to Amazon)
            "name": name,
            "cat": cat,
            "catName": CAT_NAMES.get(cat, cat),
            "image": image,
            "childCount": len(child_rows),
            "s7": round(agg["s7"], 2), "r7": round(agg["r7"], 2),
            "s30": round(agg["s30"], 2), "r30": round(agg["r30"], 2),
            "rate30": rate30,
            "rate7": rate7,
            "delta": delta,
            "flagged": flagged,
            "children": child_rows,
        })

        kpi["s30"] += agg["s30"]; kpi["r30"] += agg["r30"]
        kpi["s7"] += agg["s7"];  kpi["r7"] += agg["r7"]

    # Default order: biggest last-week revenue first.
    parents_out.sort(key=lambda p: -p["s7"])

    blended30 = rate(kpi["r30"], kpi["s30"])
    blended7 = rate(kpi["r7"], kpi["s7"])
    movers = [p for p in parents_out if p["delta"] is not None]
    worst = max(movers, key=lambda p: p["delta"], default=None)

    out = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "marketplace": w30.get("marketplace", "US"),
        "windows": {
            "d30": {"from": w30["from"], "to": w30["to"]},
            "d7": {"from": w7["from"], "to": w7["to"]},
        },
        "thresholds": {
            "minSales7d": MIN_SALES_7D,
            "flagRate30d": FLAG_RATE_30D,
            "flagDeltaPp": FLAG_DELTA_PP,
        },
        "kpis": {
            "parents": len(parents_out),
            "flagged": len([p for p in parents_out if p["flagged"]]),
            "sales7": round(kpi["s7"], 2),
            "refund7": round(kpi["r7"], 2),
            "blendedRate30": blended30,
            "blendedRate7": blended7,
            "blendedDelta": round(blended7 - blended30, 2),
            "worstMover": {"family": worst["family"], "name": worst["name"], "delta": worst["delta"]} if worst else None,
        },
        "parents": parents_out,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT} — {len(parents_out)} families (>= ${MIN_SALES_7D} 7d sales), "
          f"blended 30d refund rate {blended30}%.")


if __name__ == "__main__":
    main()
