# BodyJ4You Supply Chain Dashboard

Web app that reads the weekly **`Miami Warehouse - MM.DD.YY.xlsx`** snapshots (produced by the
`component-reorder` skill) and lets you build a Purchase Order to send to **FAT WIN TRADING
LIMITED (Bony)**, exported as a PDF.

The dashboard pulls snapshots from a Google Drive folder via a scheduled GitHub Action — no
manual file upload. The newest snapshot is the default view; an in-header dropdown switches
between archived weeks.

This project lives inside the `bodyj4you` monorepo as a sibling of `miami-dashboard/` and
`china-dashboard/`. The sync workflow is at the repo root
(`.github/workflows/sync-supply-chain.yml`) and is scoped to this subfolder.

## Run locally

```
npm install
npm run dev       # http://localhost:5173 (uses whatever is in public/data/)
npm run build     # production bundle into dist/
npm run preview   # serve the production build
```

The repo ships with a seed snapshot in `public/data/archive/` so the dashboard renders
immediately on `npm run dev` — the first real sync will replace the seed manifest with the
live one.

## How it works

1. **Drive sync** (`scripts/sync-from-drive.mjs`) — runs on a schedule via GitHub Actions.
   It lists every file in the configured Drive folder whose name contains `Miami Warehouse`
   (either `.xlsx` or a Google Sheet), downloads them into `public/data/archive/`, and writes
   `public/data/manifest.json`. Files removed from Drive are pruned locally.
2. **Manifest** (`public/data/manifest.json`) — single source of truth for what snapshots exist.
   The app's `src/driveLoader.js` fetches it at runtime.
3. **App** (`src/App.jsx`) — on mount, loads the manifest, defaults to `manifest.latest`,
   fetches the chosen file's xlsx, parses it with `src/parseFile.js`, and renders three tabs:
   **Miami Stock**, **Inbound POs**, **Shipments by Week**.
4. **PO cart** (right panel) — pick items, set quantities, pick freight, write notes, then
   **Export PDF** (`src/pdf.js`, jsPDF) → `BodyJ4You_PO_<date>.pdf`.

## Drive folder convention

Create one folder anywhere in Drive (suggested name: `BodyJ4You — Miami Warehouse`). Drop
the weekly files into it exactly as the skill names them:

```
Miami Warehouse - MM.DD.YY.xlsx
```

The sync picks up any file whose name contains `Miami Warehouse` and is either `.xlsx` or
a Google Sheet (auto-converted on export). Label and sort order are derived from `MM.DD.YY`.

## One-time setup — Drive credentials

The sync script and the GitHub Action both need:

| Variable | Where it lives | What it is |
| --- | --- | --- |
| `GDRIVE_FOLDER_ID` (local) / `SUPPLY_CHAIN_GDRIVE_FOLDER_ID` (repo secret) | `.env` locally; repo Action secret in CI | The Drive folder ID (the part after `/folders/` in the URL). Currently: `1WILT2WleC0ztjwdgNo1-cvFrrBcwcK3e` |
| `GDRIVE_SA_KEY` | `.env` locally; repo Action secret in CI | The full service-account JSON, on a single line. Reuses the same secret as the miami/china dashboards. |

Steps:

1. In Google Cloud Console, create a service account (or reuse the one already used by your
   `miami-dashboard` / `china-dashboard`). Download its JSON key.
2. Share the Drive folder with the service account's email, **Viewer** access.
3. Add both secrets under **Settings → Secrets and variables → Actions** in this repo.
4. For local sync: copy `.env.example` → `.env` and fill both vars.

## Running the sync

```
npm run sync          # local (reads .env)
npm run sync:ci       # CI / GitHub Action (reads env vars directly)
```

The GitHub Action `.github/workflows/sync.yml` runs every 15 minutes by default, on manual
dispatch, and on pushes to the sync script itself. It commits any changes under `public/data/`
back to `main`, which triggers Netlify (or wherever you deploy) to redeploy.

## Things you may want to edit

- `src/lib/categories.js` — components have no explicit category column; categories are derived
  by keyword. Adjust the rules to match your catalog.
- `src/lib/format.js` — `coverage()` defines the days-covered color buckets (≤14 red, ≤30
  orange, ≤60 yellow, else green) and the OUT OF STOCK / No Demand logic.
- `src/pdf.js` — `SUPPLIER` constant and the PO PDF layout.
- `.github/workflows/sync.yml` — change the cron interval if 15 min is too aggressive.

## Architecture notes

- The dashboard is a **renderer** — every number comes from a cell in the xlsx. It does not
  recompute velocity, days, or reorder quantities. The `component-reorder` skill owns the math.
- Snapshots are immutable on disk; the cart is wiped when you switch snapshots because unit
  costs can change week to week.
- The legacy `src/components/UploadZone.jsx` is not wired into the app but is kept in the repo
  in case you want to add a "load local file" fallback later.
