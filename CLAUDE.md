# BodyJ4You Reorder Dashboards — Runbook

This repo holds two static dashboards that visualize the weekly reorder lists:

- **miami-dashboard/** → https://inventory-reorder-maimi.netlify.app
- **china-dashboard/** → https://inventory-reorder-china.netlify.app

Both are React + Vite static sites, auto-deployed by **Netlify on every push to `main`**.
Each opens straight to its bundled snapshot in `public/data/` (`latest.xlsx` + `manifest.json`)
and shows the snapshot date. No backend, no manual Netlify steps.

## THE WEEKLY WORKFLOW (Version 1 — the chat path)

When the user drops a **raw FBA / Sellerboard stock file** and asks to publish:

1. **Run the `inventory-reorder` skill** on the raw file the user provided.
   It produces two files (the skill carries its own catalog/BOM reference):
   - `Reorder_Miami_<MM.DD.YY>.xlsx`  (sheets: `Miami Reorder` + `Summary`)
   - `Reorder_China_<MM.DD.YY>.xlsx`  (sheets: `China Reorder` + `Summary`)

2. **Publish both with one command** from the repo root:
   ```
   node publish.mjs "<path to Reorder_Miami_*.xlsx>" "<path to Reorder_China_*.xlsx>"
   ```
   This copies each file into the right dashboard's `public/data/`, writes the manifest
   (snapshot date parsed from the filename), commits, and pushes. Netlify redeploys both.

3. **Confirm it's live** (~1-3 min): the script prints the URLs. Optionally verify:
   ```
   curl -s https://inventory-reorder-maimi.netlify.app/data/manifest.json
   curl -s https://inventory-reorder-china.netlify.app/data/manifest.json
   ```
   The `label` should match this week's date.

That's the whole loop: **raw file in → skill → `publish.mjs` → dashboards live.**
The user only ever provides the raw file.

## Hard rules (do not break)

- The dashboards are **renderers** — never recompute velocity, days, totals, or section
  assignment. Every value comes from a cell in the xlsx (the skill already computed it).
- The **Days bar / number / color** read `Display Days`; `Amazon Days` is shown as small grey
  reference text. The OUT OF STOCK badge is driven by the `Out Of Stock` flag.
- China's manifest export uses the **FBA SKU** (Merchant SKU), never the display SKU.
- Detail view is the **default**; Compact is the toggle.

## Required input format (what the skill must output)

Miami `Miami Reorder` sheet columns: `Section, SKU, ASIN, Parent ASIN, Category, Available,
Inbound, Reserved, Amazon Days, Display Days, Out Of Stock, Weighted Velocity, Min Level,
Status, QTY` (extra columns are ignored).
China `China Reorder` sheet adds **`FBA SKU`** after `SKU`.
Both need a `Summary` sheet: `Section, SKU Count, Total Units` with a `GRAND TOTAL` row.
Sections — Miami: `URGENT FBA / PLANNED FBA / UV / STEEL`; China: `PL6328 TAPER PLUGS /
GK GAUGES & KITS / PJ + FJ JEWELRY / NC CHOKERS`.

## Manual one-off publish (no skill run)

If the user hands over the two already-computed files directly:
```
node publish.mjs "<Reorder_Miami_*.xlsx>" "<Reorder_China_*.xlsx>"
```
(Order doesn't matter — files are routed by name.) To bundle just one dashboard, use that
app's own script instead: `npm run snapshot "<file>"` inside `miami-dashboard/` or
`china-dashboard/`, then commit + push.

## Other automation present (not used by Version 1)

- `automation/` + `.github/workflows/sync-reorder.yml` — a **publish-only** GitHub Action
  (Tier 1) that pulls already-computed `Reorder_*` sheets from a Drive folder and publishes
  them. Dormant unless a `GDRIVE_SA_KEY` secret is set. It does **not** run the skill.

## Updating the snapshot manually (single dashboard)

`npm run snapshot "<file.xlsx>"` inside either app copies the file to `public/data/latest.xlsx`
and regenerates `manifest.json`. Then `npm run build` to preview locally, or commit + push to
deploy.
