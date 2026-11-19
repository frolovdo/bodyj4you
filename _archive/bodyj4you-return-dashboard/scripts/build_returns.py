#!/usr/bin/env python3
"""
Build bodyj4you-return-dashboard/public/data/returns.json from the Helium 10
P&L pulls, grouped by the catalog (data/catalog.xlsx -> asin_map.json).

Inputs (all under bodyj4you-return-dashboard/data/):
  asin_map.json       ASIN -> {sku, family, cat, order}  (from build_catalog.py)
  parent_meta.json    family -> {name, image}            (title + main image)
  asin_images.json    ASIN -> media id                   (per-variation thumb)
  raw/pnl_30d.json    30-day ASIN-level P&L from Helium 10 MCP
  raw/pnl_7d.json     last-7-day ASIN-level P&L from Helium 10 MCP

Output: public/data/returns.json

Triage design (design-council spec — PM / data analyst / CEO):
  * Group by catalog family; parent = title + family SKU + flagship ASIN.
  * Show only variations that sold last week; only families >= MIN_SALES_7D.
  * Order by last-week revenue. Alerted families surface via `tier`.
  * Two alert tiers, evaluated at family level, ranked by refund dollars:
      CRITICAL  r7 >= $250  AND delta >= +2.0pp AND rate7 >= 8%
      WATCH     r7 >= $100  AND (delta >= +1.5pp OR rate7 >= 2x rate30)
    The dollar floors keep 2-3-unit noise out; the delta condition measures
    each product against its OWN 30-day baseline (so chokers' naturally high
    rates don't cry wolf, and a clean product that doubles gets caught).
  * Each alert names the `driver` — the child with the most refund $.
  * `excess7` = (rate7 - rate30)/100 * s7 — the extra dollars last week vs the
    product's own baseline; the KPI row totals it.
  * Category rollup: NC (chokers) vs rest, incl. NC share of refund dollars.

Metric: refund rate = refunded $ / sales $. Amazon units_returned is excluded
(FBA return-to-stock lag); the Refunded Amount sub-metric is the ground truth.
"""

import json
import datetime
from pathlib import Path

# ---- tunable thresholds -----------------------------------------------------
MIN_SALES_7D = 1500        # a family must have >= this much 7-day revenue
CRIT_R7 = 250              # CRITICAL: refunded $ last week
CRIT_DELTA = 2.0           #   and rise vs own 30d baseline (pp)
CRIT_RATE7 = 8.0           #   and absolute last-week rate (%)
WATCH_R7 = 100             # WATCH: refunded $ last week
WATCH_DELTA = 1.5          #   and rise vs own 30d baseline (pp) ...
WATCH_RATIO = 2.0          #   ... or last-week rate >= 2x its 30d baseline
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


def tier_for(r7, rate7, rate30, delta):
    if r7 >= CRIT_R7 and delta >= CRIT_DELTA and rate7 >= CRIT_RATE7:
        return "critical"
    if r7 >= WATCH_R7 and (delta >= WATCH_DELTA or (rate30 > 0 and rate7 >= WATCH_RATIO * rate30)):
        return "watch"
    return None


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
    cat_agg = {}

    for family, children in groups.items():
        children.sort(key=lambda a: asin_map.get(a, {}).get("order", 9999))
        primary = children[0]
        cat = asin_map.get(primary, {}).get("cat", "")
        fmeta = fam_meta.get(family, {})
        name = fmeta.get("name") or asin_map.get(primary, {}).get("sku") or family
        image = img_base + fmeta["image"] if fmeta.get("image") else img_url(primary)

        agg = {"s30": 0.0, "r30": 0.0, "s7": 0.0, "r7": 0.0}
        child_rows = []
        for asin in children:
            r30 = by30.get(asin, {"u": 0, "s": 0.0, "r": 0.0})
            r7 = by7.get(asin, {"u": 0, "s": 0.0, "r": 0.0})
            agg["s30"] += r30["s"]; agg["r30"] += r30["r"]
            agg["s7"] += r7["s"];  agg["r7"] += r7["r"]
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

        if not child_rows or agg["s7"] < MIN_SALES_7D:
            continue

        rate30 = rate(agg["r30"], agg["s30"])
        rate7 = rate(agg["r7"], agg["s7"])
        delta = round(rate7 - rate30, 2)
        excess7 = round((rate7 - rate30) / 100 * agg["s7"], 2)
        tier = tier_for(agg["r7"], rate7, rate30, delta)

        child_rows.sort(key=lambda c: c["s7"], reverse=True)
        driver = None
        if tier:
            worst = max(child_rows, key=lambda c: c["r7"])
            driver = {"sku": worst["sku"], "asin": worst["asin"],
                      "rate7": worst["rate7"], "r7": worst["r7"]}

        parents_out.append({
            "family": family,
            "sku": family,
            "asin": primary,
            "name": name,
            "cat": cat,
            "catName": CAT_NAMES.get(cat, cat),
            "image": image,
            "childCount": len(child_rows),
            "s7": round(agg["s7"], 2), "r7": round(agg["r7"], 2),
            "s30": round(agg["s30"], 2), "r30": round(agg["r30"], 2),
            "rate30": rate30, "rate7": rate7, "delta": delta,
            "excess7": excess7,
            "tier": tier,
            "driver": driver,
            "children": child_rows,
        })

        kpi["s30"] += agg["s30"]; kpi["r30"] += agg["r30"]
        kpi["s7"] += agg["s7"];  kpi["r7"] += agg["r7"]
        c = cat_agg.setdefault(cat, {"s7": 0.0, "r7": 0.0, "s30": 0.0, "r30": 0.0})
        c["s7"] += agg["s7"]; c["r7"] += agg["r7"]
        c["s30"] += agg["s30"]; c["r30"] += agg["r30"]

    parents_out.sort(key=lambda p: -p["s7"])

    blended30 = rate(kpi["r30"], kpi["s30"])
    blended7 = rate(kpi["r7"], kpi["s7"])
    excess_total = round(sum(max(0.0, p["excess7"]) for p in parents_out), 2)

    tier_rank = {"critical": 0, "watch": 1}
    alerts = sorted(
        (p for p in parents_out if p["tier"]),
        key=lambda p: (tier_rank[p["tier"]], -p["r7"]),
    )
    alerts_out = [{
        "family": p["family"], "name": p["name"], "sku": p["sku"], "asin": p["asin"],
        "cat": p["cat"], "tier": p["tier"], "image": p["image"],
        "rate7": p["rate7"], "rate30": p["rate30"], "delta": p["delta"],
        "r7": p["r7"], "excess7": p["excess7"], "driver": p["driver"],
    } for p in alerts]

    nc = cat_agg.get("NC", {"s7": 0.0, "r7": 0.0, "s30": 0.0, "r30": 0.0})
    rest_s7 = kpi["s7"] - nc["s7"]
    rest_r7 = kpi["r7"] - nc["r7"]

    out = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "marketplace": w30.get("marketplace", "US"),
        "windows": {
            "d30": {"from": w30["from"], "to": w30["to"]},
            "d7": {"from": w7["from"], "to": w7["to"]},
        },
        "thresholds": {
            "minSales7d": MIN_SALES_7D,
            "critical": {"r7": CRIT_R7, "delta": CRIT_DELTA, "rate7": CRIT_RATE7},
            "watch": {"r7": WATCH_R7, "delta": WATCH_DELTA, "ratio": WATCH_RATIO},
        },
        "kpis": {
            "parents": len(parents_out),
            "healthy": len(parents_out) - len(alerts_out),
            "critical": sum(1 for a in alerts_out if a["tier"] == "critical"),
            "watch": sum(1 for a in alerts_out if a["tier"] == "watch"),
            "alertRefund7": round(sum(a["r7"] for a in alerts_out), 2),
            "sales7": round(kpi["s7"], 2),
            "refund7": round(kpi["r7"], 2),
            "blendedRate30": blended30,
            "blendedRate7": blended7,
            "blendedDelta": round(blended7 - blended30, 2),
            "excessTotal": excess_total,
            "nc": {
                "rate7": rate(nc["r7"], nc["s7"]),
                "rate30": rate(nc["r30"], nc["s30"]),
                "refundShare7": round(nc["r7"] / kpi["r7"] * 100, 1) if kpi["r7"] else 0,
            },
            "rest": {"rate7": rate(rest_r7, rest_s7)},
        },
        "alerts": alerts_out,
        "parents": parents_out,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT} — {len(parents_out)} families, "
          f"{out['kpis']['critical']} critical / {out['kpis']['watch']} watch, "
          f"excess ${excess_total:,.0f}/wk above baseline.")


if __name__ == "__main__":
    main()
