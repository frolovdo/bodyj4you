# BodyJ4You — Daily Reorder Refresh (runbook for the 7am scheduled task)

You are an automated agent running once each morning. Your job: refresh the
Miami + China reorder dashboards with **today's live Helium10 inventory**,
while keeping **velocity frozen** from the last weekly FBA upload. Follow these
steps exactly. Do not improvise the reorder math — it all lives in reorder.py.

## Invariant (do not break)
- **Velocity is never recomputed here.** You only READ it from
  `velocity_lock.json`. The lock is rewritten only when a human uploads an FBA
  file (a separate GitHub Action handles that). If you ever find yourself
  computing velocity from sales history, stop — that's the weekly job, not this.
- You refresh **Available + Inbound** (live from Helium10). Days-of-cover and
  ship QTY recompute from that fresh inventory ÷ the frozen velocity.

## Drive folder IDs
- IN (raw FBA uploads):        `19-AoS9nM3nm702v9tw15LWQGAT2c4xQr`
- OUT_MIAMI (Miami dashboard): `1LgVtREkBxLcrrFdhkc4TTplzZhH0gu1U`
- OUT_CHINA (China dashboard): `1MBGCoI4yTltZdRlnOHcpl9pg5ZaubluF`

The velocity lock lives in OUT_MIAMI as `velocity_lock.json`.

## Steps

### 1. Set up a work dir and fetch the code (public repo, no auth)
```bash
mkdir -p /tmp/reorder && cd /tmp/reorder
pip install --quiet openpyxl
curl -sL -o reorder.py    https://raw.githubusercontent.com/frolovdo/bodyj4you/main/automation/reorder.py
curl -sL -o catalog.xlsx  https://raw.githubusercontent.com/frolovdo/bodyj4you/main/automation/catalog.xlsx
```

### 2. Get the velocity lock
Use the Google Drive tools. Search OUT_MIAMI for `velocity_lock.json`
(`parentId = '1LgVtREkBxLcrrFdhkc4TTplzZhH0gu1U' and title = 'velocity_lock.json'`),
download its content, and save it to `/tmp/reorder/velocity_lock.json`.

**If it does not exist yet (first run before any FBA upload post-setup):**
self-bootstrap it —
  1. Search IN for the newest `.csv` (sort by createdTime desc), download it to
     `/tmp/reorder/fba.csv`.
  2. `python reorder.py catalog.xlsx fba.csv velocity-lock velocity_lock.json`
  3. Upload `velocity_lock.json` into OUT_MIAMI (create_file, parentId =
     OUT_MIAMI, contentMimeType `application/json`).
Then proceed with the freshly built lock.

### 3. Pull live inventory from Helium10
Call the Helium10 inventory tool `get_inventory_values` with
`marketplace: ["US"]`, `fulfillment_type: "FBA"`, `page_size: 1000`. If
`total_count` exceeds what you received, page through (page_index 2, 3, …) until
you have every row.

Aggregate rows **by ASIN** (multiple SKUs can share one ASIN — sum them):
- `available` += `inventory.available`
- `inbound`   += `inventory.inbound_quantity`

Write `/tmp/reorder/inventory.json`:
```json
{ "by_asin": { "B0XXXXXXXX": { "available": 123, "inbound": 45 }, ... } }
```

### 4. Compute today's date label and run the daily mode
Date label is `MM.DD.YY` for today (Los Angeles time).
```bash
python reorder.py daily catalog.xlsx velocity_lock.json inventory.json \
  "Reorder_Miami_<MM.DD.YY>.xlsx" "Reorder_China_<MM.DD.YY>.xlsx"
```
Print the summary it emits (SKU counts + totals) so the run log is auditable.

### 5. Upload the two files to Drive
Upload with the Drive `create_file` tool, base64-encoding the xlsx bytes:
- Miami: parentId = OUT_MIAMI, title = `Reorder_Miami_<MM.DD.YY>.xlsx`
- China: parentId = OUT_CHINA, title = `Reorder_China_<MM.DD.YY>.xlsx`
- contentMimeType =
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `disableConversionToGoogleType: true` (keep it a real .xlsx, do not convert
  to a Google Sheet)

If a file with today's exact name already exists in the folder (you ran twice
today), that's fine — the dashboard shows the newest by createdTime.

### 6. Report
One short summary: date label, Miami SKU/unit totals, China SKU/unit totals,
and whether the lock was read or self-bootstrapped. If any step failed, say
which step and the error — do not silently produce a partial file.

## Sanity checks before you upload
- The Miami file should have roughly the same SKU count as recent snapshots
  (dozens, not hundreds). A huge inflation usually means the Helium10 pull was
  empty/partial and most ASINs defaulted to available 0 → revival qty. If Miami
  URGENT is >100 SKUs, the inventory pull probably failed — investigate, don't
  upload.
- `velocity_lock.json` must be non-empty and cover most catalog ASINs.
