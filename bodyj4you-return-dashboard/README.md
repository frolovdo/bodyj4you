# BodyJ4You — Return Dashboard

A clean, minimalistic dashboard for tracking BodyJ4You's Amazon **returns &
refunds** — refund rate by parent, expandable to each child variation, last week
vs the 30-day average, for products with significant sales.

Live data is sourced entirely from the **Helium 10 MCP** (Amazon Profits / P&L),
the site is hosted on **Netlify**, and the data refresh is **fully automated** —
nothing is run by hand.

---

## What the Returns & Refunds view shows

- **Grouped by catalog family, expandable to each variation.** Each parent shows
  its title, parent SKU (catalog master) and flagship ASIN; expand to reveal
  every variation as **SKU + ASIN** (ASINs link to Amazon) with its own numbers.
- **Revenue-ordered.** Parents and variations are sorted by last-week sales,
  biggest first — regardless of refund rate.
- **Columns.** Sales = last 7 days, Refunds = last 7 days, **Refund rate =
  30-day average**, plus the trend (Δ pp, last week vs the 30-day average).
- **Substantial sellers only.** A family is hidden unless it did ≥ `minSales7d`
  (default **$1,500**) in last-week sales, and any variation that didn't sell
  last week is hidden — so the list stays short and actionable.
- **Alerts (2 tiers), ranked by dollars.** CRITICAL = ≥$250 refunded/wk AND
  up ≥2pp vs its own 30-day baseline AND ≥8% last-week rate. WATCH = ≥$100/wk
  AND rising ≥1.5pp (or 2× its baseline). Each alert names the child variation
  driving it. Alerts can be acknowledged (muted 30 days, per device).
- **Triage layout.** Headline sentence in dollars → alert cards with Amazon
  listing/reviews links → 3 KPIs → table with healthy products collapsed
  behind one line. Dark theme matching the CEO dashboard family.

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
data/catalog.xlsx ─►(build_catalog.py)─► data/asin_map.json   (SKU↔ASIN↔family)
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

Grouping is driven by the **catalog** (`data/catalog.xlsx`, sheet `Active`),
so parents match exactly what the brief uses — including families the brief
merges but Amazon splits (e.g. both Tea Tree parent ASINs → `PD-TEATREE-MCT`).

- **`data/asin_map.json`** — generated from `data/catalog.xlsx` by
  `scripts/build_catalog.py`: every ASIN → `{sku, family, cat, order}`. The
  single source of truth for grouping. Regenerate when the catalog changes.
- **`data/parent_meta.json`** — title + main image (Amazon media id) per family.
  **`data/asin_images.json`** — per-variation thumbnail (media id) per child
  ASIN. Display-only; anything missing falls back to a category tile.
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
cd bodyj4you-return-dashboard
npm install
npm run data     # rebuild public/data/returns.json from data/raw + catalog
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
```

## Netlify setup (one time)

Create a new site from this repo and set **Base directory = `bodyj4you-return-dashboard`**
(the same per-folder pattern as the Miami / China / Supply-Chain sites in this
repo). `netlify.toml` handles the rest: build `npm run build`, publish `dist`,
skip builds when only sibling folders changed, and SPA redirects. Every push
that touches `bodyj4you-return-dashboard/` triggers a deploy.

## Automated weekly refresh

See **[REFRESH.md](./REFRESH.md)**. A scheduled Claude session re-pulls the two
Helium 10 windows every Monday, rebuilds `public/data/returns.json`, and commits
— which triggers the Netlify deploy. No manual step.

> Why not a plain GitHub Action cron? The Helium 10 MCP is an
> interactively-authenticated connector; a headless GitHub Actions runner cannot
> call it. A scheduled Claude session can, so that is the refresh engine.
