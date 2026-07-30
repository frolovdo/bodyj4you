#!/usr/bin/env python3
"""
Build seo-dashboard/public/data/returns.json from the Helium 10 P&L pulls.

Inputs  (all under seo-dashboard/data/):
  catalog.json      parent + variant display metadata (hand-curated)
  raw/pnl_30d.json  30-day ASIN-level P&L breakdown from Helium 10 MCP
  raw/pnl_7d.json   last-7-day ASIN-level P&L breakdown from Helium 10 MCP

Output:
  public/data/returns.json  the shape the React app renders.

Metric notes
------------
Amazon's `units_returned` from Profits lags heavily (FBA return-to-stock) and
reads ~0, so it is NOT used. The reliable return/refund signal is the
`Refunded Amount` refund sub-metric (gross customer refund $), captured as `r`
in the raw files. The headline metric is therefore:

    refund rate = refunded $ / sales $   (share of revenue refunded)

Trend = last-week refund rate  vs  30-day average refund rate (delta in pp).
Only parents with "significant sales" (>= MIN_UNITS_30D units over 30 days)
are shown, so low-volume noise never floats to the top.

This script is pure/deterministic: same inputs -> same output. It performs no
network calls. Refreshing the dashboard = refresh the two raw/*.json pulls
(via the Helium 10 MCP) and re-run this script.
"""

import json
import datetime
from pathlib import Path

# ---- tunable thresholds -----------------------------------------------------
MIN_UNITS_30D = 50      # "significant sales" gate, at the parent level
FLAG_RATE_7D = 5.0      # a parent is flagged if last-week refund rate >= this %
FLAG_DELTA_PP = 1.0     # ...and it rose at least this many points vs 30-day avg
FLAG_MIN_REFUND_7D = 25 # ...and refunded at least this many $ last week
# -----------------------------------------------------------------------------

DATA = Path(__file__).resolve().parent.parent / "data"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "returns.json"

CAT_NAMES = {
    "PA": "Piercing Aftercare",
    "EO": "Essential & Carrier Oils",
    "GK": "Gauge / Stretching Kits",
    "NC": "Choker Necklaces",
    "PJ": "Piercing Jewelry",
}


def load(name):
    return json.loads((DATA / name).read_text())


def rate(refund, sales):
    return round(refund / sales * 100, 2) if sales else 0.0


def main():
    catalog = load("catalog.json")
    w30 = load(Path("raw") / "pnl_30d.json")
    w7 = load(Path("raw") / "pnl_7d.json")

    parents_meta = catalog["parents"]
    variants = catalog["variants"]
    img_base = catalog["imageBase"]

    by30 = {row["a"]: row for row in w30["rows"]}
    by7 = {row["a"]: row for row in w7["rows"]}
    all_asins = set(by30) | set(by7)

    # Resolve every ASIN to its parent (fall back to the ASIN itself).
    def parent_of(asin):
        if asin in variants:
            return variants[asin]["parent"]
        return asin

    # Group children under parents.
    groups = {}
    for asin in all_asins:
        p = parent_of(asin)
        groups.setdefault(p, []).append(asin)

    parents_out = []
    kpi = {"s30": 0.0, "r30": 0.0, "s7": 0.0, "r7": 0.0}

    for pasin, children in groups.items():
        meta = parents_meta.get(pasin, {})
        pname = meta.get("name", pasin)
        cat = meta.get("cat", "")
        image = img_base + meta["image"] if meta.get("image") else None

        agg = {"u30": 0, "s30": 0.0, "r30": 0.0, "u7": 0, "s7": 0.0, "r7": 0.0}
        child_rows = []
        for asin in children:
            r30 = by30.get(asin, {"u": 0, "s": 0.0, "r": 0.0})
            r7 = by7.get(asin, {"u": 0, "s": 0.0, "r": 0.0})
            agg["u30"] += r30["u"]; agg["s30"] += r30["s"]; agg["r30"] += r30["r"]
            agg["u7"] += r7["u"];  agg["s7"] += r7["s"];  agg["r7"] += r7["r"]
            vlabel = variants.get(asin, {}).get("label", asin)
            child_rows.append({
                "asin": asin,
                "label": vlabel,
                "u30": r30["u"], "s30": round(r30["s"], 2), "r30": round(r30["r"], 2),
                "rate30": rate(r30["r"], r30["s"]),
                "u7": r7["u"], "s7": round(r7["s"], 2), "r7": round(r7["r"], 2),
                "rate7": rate(r7["r"], r7["s"]),
                "delta": round(rate(r7["r"], r7["s"]) - rate(r30["r"], r30["s"]), 2),
            })

        # "significant sales" gate
        if agg["u30"] < MIN_UNITS_30D:
            continue

        rate30 = rate(agg["r30"], agg["s30"])
        rate7 = rate(agg["r7"], agg["s7"]) if agg["s7"] else None
        delta = round(rate7 - rate30, 2) if rate7 is not None else None
        flagged = bool(
            rate7 is not None
            and rate7 >= FLAG_RATE_7D
            and delta is not None and delta >= FLAG_DELTA_PP
            and agg["r7"] >= FLAG_MIN_REFUND_7D
        )

        # Sort children worst-first by last-week rate, then 30-day rate.
        child_rows.sort(key=lambda c: (c["rate7"], c["rate30"]), reverse=True)

        parents_out.append({
            "asin": pasin,
            "name": pname,
            "cat": cat,
            "catName": CAT_NAMES.get(cat, cat),
            "image": image,
            "childCount": len([c for c in child_rows if c["u30"] or c["u7"]]),
            "u30": agg["u30"], "s30": round(agg["s30"], 2), "r30": round(agg["r30"], 2),
            "rate30": rate30,
            "u7": agg["u7"], "s7": round(agg["s7"], 2), "r7": round(agg["r7"], 2),
            "rate7": rate7,
            "delta": delta,
            "flagged": flagged,
            "children": child_rows,
        })

        kpi["s30"] += agg["s30"]; kpi["r30"] += agg["r30"]
        kpi["s7"] += agg["s7"];  kpi["r7"] += agg["r7"]

    # Default sort: worst last-week refund rate first (problems on top).
    parents_out.sort(key=lambda p: (p["rate7"] is None, -(p["rate7"] or 0)))

    blended30 = rate(kpi["r30"], kpi["s30"])
    blended7 = rate(kpi["r7"], kpi["s7"])
    movers = [p for p in parents_out if p["delta"] is not None]
    worst = max(movers, key=lambda p: p["delta"], default=None)
    best = min(movers, key=lambda p: p["delta"], default=None)

    out = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="seconds"),
        "marketplace": w30.get("marketplace", "US"),
        "windows": {
            "d30": {"from": w30["from"], "to": w30["to"]},
            "d7": {"from": w7["from"], "to": w7["to"]},
        },
        "thresholds": {
            "minUnits30d": MIN_UNITS_30D,
            "flagRate7d": FLAG_RATE_7D,
            "flagDeltaPp": FLAG_DELTA_PP,
        },
        "kpis": {
            "parents": len(parents_out),
            "flagged": len([p for p in parents_out if p["flagged"]]),
            "sales30": round(kpi["s30"], 2),
            "refund30": round(kpi["r30"], 2),
            "blendedRate30": blended30,
            "sales7": round(kpi["s7"], 2),
            "refund7": round(kpi["r7"], 2),
            "blendedRate7": blended7,
            "blendedDelta": round(blended7 - blended30, 2),
            "worstMover": {"asin": worst["asin"], "name": worst["name"], "delta": worst["delta"]} if worst else None,
            "bestMover": {"asin": best["asin"], "name": best["name"], "delta": best["delta"]} if best else None,
        },
        "parents": parents_out,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT} — {len(parents_out)} significant parents, "
          f"blended refund rate {blended7}% (7d) vs {blended30}% (30d avg).")


if __name__ == "__main__":
    main()
