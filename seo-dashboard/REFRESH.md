# Automated weekly refresh — runbook

The Returns & Refunds data refreshes **every Monday** with no manual step. A
scheduled Claude session (a "Routine", set up via the Claude Code Remote
`create_trigger` tool) runs this exact procedure and commits the result;
committing to the deploy branch triggers the Netlify build.

This file is both the human runbook **and** the instruction set the scheduled
session follows. Keep them identical.

## One-time setup — create the Routine in the claude.ai UI

The refresh must run in a Claude session that has the **Helium 10** connector,
so create it from **claude.ai → Routines** (that's where your connectors live):

1. New Routine → schedule **Weekly, Monday ~9:00 AM** (cron `0 13 * * 1` UTC).
2. Enable connectors: **Helium 10** and **GitHub**.
3. Mode: start a **new session** each run (fresh session per fire).
4. Paste this as the prompt:

   > Refresh the BodyJ4You SEO Dashboard "Returns & Refunds" data in the
   > `frolovdo/bodyj4you` repo by following `seo-dashboard/REFRESH.md` exactly.
   > Work on `main`, change only the data files (raw pulls, catalog.json,
   > public/data/returns.json), commit, and push — do not open a PR or touch app
   > code. If the Helium 10 pull returns nothing, skip the commit and report it.

That's it — after that it is fully hands-off. To pause it, disable the Routine.

## Preconditions (available in the scheduled session's environment)

- The **Helium 10** connector (same one used to build the seed data).
- The **GitHub** connector / write access to `frolovdo/bodyj4you`.

## Procedure

1. **Compute the two date windows** relative to the run date (US/Pacific, the
   Helium 10 default `date_tz`):
   - `30d` = the last 30 full days ending yesterday.
   - `7d`  = the last 7 full days ending yesterday.

2. **Pull ASIN-level P&L from Helium 10** for each window. Tool:
   `get_product_profit_and_loss_breakdown` with
   `product_level="asin"`, `marketplace=["US"]`,
   `breakdown_metrics=["units_sold","refund","sales"]`,
   `sort_by="units_sold"`, `sort_order="desc"`, `page_size=50`. The API returns
   10 rows/page — paginate (`page_index` 1,2,3,…) until a page returns fewer than
   10 rows **or** `units_sold` drops below ~30 (the long tail is immaterial to a
   significant-sales view). ~6 pages covers the catalog.

3. **Write the raw files** `seo-dashboard/data/raw/pnl_30d.json` and
   `pnl_7d.json`, keeping the existing shape: `window`, `from`, `to`,
   `marketplace`, and `rows: [{a, u, s, r}]` where
   - `a` = ASIN,
   - `u` = `units_sold.value`,
   - `s` = `sales.value`,
   - `r` = **absolute value** of the `Refunded Amount` sub-metric inside
     `refund.metrics` (not the net `refund.value`).

4. **Grouping comes from the Monday-brief catalog** (`automation/catalog.xlsx`),
   not from Amazon's `parent_asin`. For any ASIN in the pull that is **not**
   already in that catalog, add a row to the `Catalog` sheet (SKU, ASIN, Parent
   ASIN / family, Category) so it groups correctly, then regenerate the map:
   ```bash
   pip install openpyxl
   cd seo-dashboard && python3 scripts/build_catalog.py   # -> data/asin_map.json
   ```
   If the ASIN introduces a **new family**, add a `families` entry to
   `data/parent_meta.json` (`name`, `image` = Amazon media id). Optionally add a
   short `data/variant_labels.json` entry for the child. Both are display-only;
   missing entries fall back to the SKU.

5. **Rebuild** the dashboard JSON:
   ```bash
   cd seo-dashboard && python3 scripts/build_returns.py
   ```
   This joins the pulls to `asin_map.json` + `parent_meta.json` +
   `variant_labels.json` and regenerates `public/data/returns.json`
   deterministically.

6. **Commit & push** to the deploy branch (`main`) so Netlify redeploys:
   ```
   git add seo-dashboard/data seo-dashboard/public/data/returns.json
   git commit -m "Refresh Returns & Refunds data (<7d from>–<7d to>)"
   git push
   ```
   If nothing changed, make no commit.

7. **Sanity check** the build log line: it prints the parent count and the
   blended 7d vs 30d refund rate. If the pull returned zero rows (e.g. the MCP
   connector was unavailable in the scheduled session), do **not** commit an
   empty dataset — leave the previous `returns.json` in place and report it.

## Changing cadence / thresholds

- Cadence: edit the Routine's cron (via `update_trigger`), or the user can
  disable it.
- Significant-sales gate & flag rules: edit the constants at the top of
  `scripts/build_returns.py` and re-run.
