# Automated weekly refresh — runbook

The Returns & Refunds data refreshes **every Monday** with no manual step. A
scheduled Claude session (a "Routine", set up via the Claude Code Remote
`create_trigger` tool) runs this exact procedure and commits the result;
committing to the deploy branch triggers the Netlify build.

This file is both the human runbook **and** the instruction set the scheduled
session follows. Keep them identical.

## Preconditions (available in the scheduled session's environment)

- The `Helium10-MCP` connector (same one used to build the seed data).
- The `github` connector / write access to `frolovdo/bodyj4you`.

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

4. **Update the catalog if needed.** For any ASIN in the pull that is not in
   `seo-dashboard/data/catalog.json`, add it: a `variants` entry
   (`parent`, `label`) and, if it introduces a new parent, a `parents` entry
   (`name`, `cat` ∈ PA/EO/NC/GK/PJ, `image`). Use the `parent_asin` field from
   the pull to map children to parents.

5. **Rebuild** the dashboard JSON:
   ```bash
   cd seo-dashboard && python3 scripts/build_returns.py
   ```
   This regenerates `public/data/returns.json` deterministically.

6. **Commit & push** to the deploy branch (`main`) so Netlify redeploys:
   ```
   git add seo-dashboard/data/raw seo-dashboard/data/catalog.json seo-dashboard/public/data/returns.json
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
