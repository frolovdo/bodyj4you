# BodyJ4You — SEO Dashboard

A clean, minimalistic dashboard page for BodyJ4You's Amazon SEO/operations. The
first (and currently only) section is **Returns & Refunds**; the layout is built
so more SEO sections (Keyword Rank, Traffic, Listing Health) can slot in as tabs.

Live data is sourced entirely from the **Helium 10 MCP** (Amazon Profits / P&L),
the site is hosted on **Netlify**, and the data refresh is **fully automated** —
nothing is run by hand.

---

## What the Returns & Refunds view shows

- **Grouped by parent, expandable to each child variation.** Rows are parent
  ASINs; click one to reveal every variation (size, scent, color, gauge) beneath
  it with its own numbers.
- **Last week vs 30-day average.** The headline is each parent's refund rate for
  the last 7 days, with the trend (Δ in percentage points) against its own
  30-day average.
- **Only products with significant sales.** Parents below `minUnits30d`
  (default **50 units / 30 days**) are hidden so low-volume noise never floats to
  the top.
- **Flagging.** A parent is flagged when last-week refund rate ≥ 5% **and** it
  rose ≥ 1 pp vs its 30-day average **and** it refunded ≥ $25 last week.

### The metric — why refund $, not "units returned"

Amazon's `units_returned` (from Profits) lags heavily because of FBA
return-to-stock timing and reads near-zero, so it is **not** used. The reliable
signal is the **`Refunded Amount`** refund sub-metric — actual customer refund
dollars. The headline metric is therefore:

```
refund rate = refunded $ / sales $   (share of revenue refunded)
```

---

## Architecture

```
automation/catalog.xlsx ─►(build_catalog.py)─► data/asin_map.json   (SKU↔ASIN↔family)
Helium 10 MCP  ──►  data/raw/pnl_30d.json      (agent pulls, weekly)
                    data/raw/pnl_7d.json
        │                data/parent_meta.json (name + main image per family)
        │                data/variant_labels.json
        ▼
scripts/build_returns.py  (pure, deterministic)
        │
        ▼
public/data/returns.json  ──►  Vite/React app  ──►  Netlify (auto-deploy on push)
```

Grouping is driven by the **Monday-brief catalog** (`automation/catalog.xlsx`),
so parents match exactly what the brief uses — including families the brief
merges but Amazon splits (e.g. both Tea Tree parent ASINs → `PD-TEATREE-MCT`).

- **`data/asin_map.json`** — generated from `automation/catalog.xlsx` by
  `scripts/build_catalog.py`: every ASIN → `{sku, family, cat, order}`. The
  single source of truth for grouping. Regenerate when the catalog changes.
- **`data/parent_meta.json`** — display name + main image (Amazon media id) per
  family. **`data/variant_labels.json`** — short label per child ASIN. Both are
  display-only; anything missing falls back to the SKU.
- **`data/raw/pnl_30d.json`, `pnl_7d.json`** — ASIN-level P&L pulled from
  Helium 10 (`get_product_profit_and_loss_breakdown`, `product_level=asin`, US)
  for the two windows. `u`=units, `s`=sales $, `r`=refunded $ (abs).
- **`scripts/build_returns.py`** — rolls children up to their catalog family,
  computes rates + trend, applies the significant-sales gate, and writes
  `public/data/returns.json`. No network calls; same inputs → same output.
  Every parent carries its base SKU and main image; each child carries its SKU.
- **React app** (`src/`) — reads `public/data/returns.json` and renders it. Plain
  CSS, no UI framework, ~49 KB gzipped.

---

## Local development

```bash
cd seo-dashboard
npm install
npm run data     # rebuild public/data/returns.json from data/raw + catalog
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
```

## Netlify setup (one time)

Create a new site from this repo and set **Base directory = `seo-dashboard`**
(the same per-folder pattern as the Miami / China / Supply-Chain sites in this
repo). `netlify.toml` handles the rest: build `npm run build`, publish `dist`,
skip builds when only sibling folders changed, and SPA redirects. Every push
that touches `seo-dashboard/` triggers a deploy.

## Automated weekly refresh

See **[REFRESH.md](./REFRESH.md)**. A scheduled Claude session re-pulls the two
Helium 10 windows every Monday, rebuilds `public/data/returns.json`, and commits
— which triggers the Netlify deploy. No manual step.

> Why not a plain GitHub Action cron? The Helium 10 MCP is an
> interactively-authenticated connector; a headless GitHub Actions runner cannot
> call it. A scheduled Claude session can, so that is the refresh engine.
