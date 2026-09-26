# BodyJ4You — Daily Reorder Refresh (7am)

**Since 2026-09-25, velocity is rebuilt fresh on every run** from Amazon's units
sold in the last 7 / 30 / 60 / 90 days. The old daily mode that froze velocity in
`velocity_lock.json` and only refreshed inventory is retired. `reorder.py daily`
still exists, but nothing calls it on a schedule anymore.

## What runs
The Claude desktop app runs the local scheduled task `bodyj4you-daily-reorder` at 7am.
It drives one runner on Denis's machine:
`C:\Users\Admin\Projects\ceo-dashboard-build\reorder-miami-china\daily_reorder_run.py`
(`prepare` → `existing` → `b64` + Drive `create_file` + `verify` → `report`).

1. **Code.** Fetch `automation/reorder.py` + `automation/catalog.xlsx` from this repo
   (raw GitHub), so the math is always what's committed here.
2. **Amazon data.** Pull the FBA Inventory Planning report (`GET_FBA_INVENTORY_PLANNING_DATA`)
   with the SP-API Reports API into `fba_planning.csv`. It has the same columns as the
   manual Seller Central FBA inventory CSV: `units-shipped-t7/t30/t60/t90`, `available`,
   `inbound-quantity`, `Total Reserved Quantity`, `days-of-supply`,
   `fba-minimum-inventory-level`, `snapshot-date`.
3. **Full recount.** Same as a weekly FBA upload. The date label is the report's `snapshot-date`:
   ```bash
   python reorder.py catalog.xlsx fba_planning.csv miami-xlsx Reorder_Miami_<MM.DD.YY>.xlsx
   python reorder.py catalog.xlsx fba_planning.csv china-xlsx Reorder_China_<MM.DD.YY>.xlsx
   ```
4. **Sanity checks.** If any of these fail, nothing is uploaded:
   - the report has at least 500 SKUs, more than 10k available units and more than 1k units sold in 30 days;
   - the snapshot is no more than 3 days old;
   - Miami has fewer than 100 URGENT SKUs;
   - both xlsx files open.
5. **Upload.** Put both xlsx files into OUT_MIAMI / OUT_CHINA and verify each one by md5:
   Drive's `md5Checksum` must equal the local file's md5. Retry up to 3 times.
   Never delete existing files. The dashboards show the file with the newest date,
   and among files with the same name, the newest one wins.
6. **Best-seller alert.** Flag any of the top 50 by 30-day units that has less than 14 days of cover on
   live SP-API inventory, and publish it to the CEO dashboard at `/best-sellers/`.

## Drive folder IDs
- IN (raw FBA uploads):        `19-AoS9nM3nm702v9tw15LWQGAT2c4xQr`
- OUT_MIAMI (Miami dashboard): `1LgVtREkBxLcrrFdhkc4TTplzZhH0gu1U`
- OUT_CHINA (China dashboard): `1MBGCoI4yTltZdRlnOHcpl9pg5ZaubluF`

## Manual path (unchanged)
Upload an FBA CSV to IN and click "Refresh from Drive". The GitHub Action
`sync-reorder.yml` then runs the same full recount.
