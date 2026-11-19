# BodyJ4You Bundle Report Tool

Turns an Amazon virtual-bundle sales export into the xlsx bundle report and the
HTML dashboard. Pure Python, no network, no LLM. Runs headless from a terminal
or an API/cron job.

## Install (once)

    pip install -r requirements.txt

Needs Python 3.8+ (`openpyxl` required; `Pillow` optional, only for embedding
product photos in the HTML).

## Run

    python build_report.py EXPORT.csv

Writes two files to the current directory, named by the latest date in the CSV:

    Bundle Report - MM.DD.YY.xlsx
    Bundle Report - MM.DD.YY.html

Options:

    --outdir DIR        where to write (default: current dir)
    --threshold N       "noticeable" units cut for the HTML default view (default: 3)
    --label "..."       header date label (default: derived from CSV dates)
    --date MM.DD.YY     stamp for file/tab names (default: latest CSV date)
    --config PATH       alternate config.json

Example:

    python build_report.py ~/Downloads/part-00024-xxxx.csv --outdir ./reports

The console prints totals, the noticeable count, how many photos were found, the
dropped (unmapped) ASINs, and which noticeable SKUs still lack a photo.

## Input CSV

Amazon's virtual-bundle export. Columns used: `BUNDLE_ASIN`, `BUNDLES_SOLD`,
`TOTAL_SALES`, `TITLE`, `DATE`. Extra columns are ignored. Each ASIN can appear
on many rows; they are summed.

## What it does (locked logic)

1. Aggregate export rows by `BUNDLE_ASIN`: Units = sum of `BUNDLES_SOLD`,
   Sales = sum of `TOTAL_SALES`.
2. Left-join every bundle in the BUNDLES master (`data_bundles_master.xlsx`,
   sheet `BUNDLES`) for SKU / MAIN / COMP 1 / COMP 2.
3. Avg Price = Sales / Units.
4. Stable sort by Units descending; zero-sales bundles fall to the bottom in
   master order.
5. Grand-total row (sum of Sales).
6. ASINs not in the master (and not in `config.json` `new_asin_map`) are dropped,
   listed in the console, and written to an "Unmapped (dropped)" tab.

The HTML shows the bundles at or above the threshold, ranked, with embedded
photos, each card linking to `amazon.com/dp/<ASIN>`. A built-in toggle
(1+ / 2+ / 3+ / 5+ / 10+) re-filters live in the browser.

## Files

    build_report.py            the tool
    config.json                settings + new_asin_map (ASINs not yet in master)
    data_bundles_master.xlsx   the BUNDLES master (ASIN -> SKU + components)
    report_template.html       HTML shell with __DATA__ / __IMAGES__ placeholders
    reference_images/          SKU_ASIN.png product photos, embedded into the HTML
    requirements.txt

## Maintaining it

- **New bundle ASIN shows up as "dropped":** add it to `new_asin_map` in
  `config.json` as `"ASIN": "SKU"`. Better: add the full row (ASIN, SKU, MAIN,
  COMP 1, COMP 2) to the `BUNDLES` sheet of `data_bundles_master.xlsx` so the
  component columns fill in too, then it no longer needs the config entry.
- **Add a product photo:** drop a file named `SKU_ASIN.png` (e.g.
  `VB0229_B0FKMRVBHT.png`) into `reference_images/`. Matching is by the ASIN at
  the end of the filename. Without a photo the card shows a category tile.
- **Refresh the master:** replace `data_bundles_master.xlsx` with a newer copy
  (same sheet name `BUNDLES`, same column order).

## Notes

- Self-contained HTML: photos are embedded as base64, so the file opens and
  shares with no external dependencies.
- Deterministic: same CSV in, same files out. Safe to schedule.
