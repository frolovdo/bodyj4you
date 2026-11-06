# BodyJ4You Supply Chain Dashboard

Web app that reads the weekly **`Miami Warehouse - MM.DD.YY.xlsx`** snapshots (produced by the
`component-reorder` skill) and lets you build a Purchase Order to send to **FAT WIN TRADING
LIMITED (Bony)**, exported as a PDF.

The dashboard pulls snapshots from a Google Drive folder by running the sync on the Mac (never on GitHub) — no
manual file upload. The newest snapshot is the default view; an in-header dropdown switches
between archived weeks.

This project lives inside the `bodyj4you` monorepo as a sibling of `miami-dashboard/` and
`china-dashboard/`. The sync runs locally: `npm run sync` here, or
`node automation/local-runner.mjs run supply_chain` from the repo root (see `automation/LOCAL_RUNNER.md`).

## Run locally

```
npm install
npm run dev       # http://localhost:5173 (uses whatever is in public/data/)
npm run build     # production bundle into dist/
npm run preview   # serve the production build
```

Local dev shows production data: `src/driveLoader.js` always fetches from
`raw.githubusercontent.com/frolovdo/bodyj4you/main/data/supply-chain/`, so
`npm run dev` works without any local data files.

## How it works

The architecture is intentionally split into two pieces that update independently:

- **The React app** lives in `supply-chain-dashboard/` and is built + deployed by
  Netlify whenever its own code changes. Drive drops never touch this folder, so
  weekly file uploads do **not** trigger Netlify builds.
- **The data** lives at the monorepo root in `data/supply-chain/` (NOT inside this
  React subfolder). The browser fetches it directly from GitHub's raw CDN, which is
  CORS-open for public repos and has a 5-minute cache (fine for an hourly cadence).

Flow:

1. **Drive sync** (`scripts/sync-from-drive.mjs`) — runs on the Mac via
   `node automation/local-runner.mjs run supply_chain`. Lists every file in the Drive folder
   whose name contains `Miami Warehouse`, downloads new/changed ones into
   `data/supply-chain/archive/`, writes `data/supply-chain/manifest.json`, prunes
   files no longer in Drive, commits + pushes back to `main`.
2. **Manifest** (`data/supply-chain/manifest.json`) — single source of truth for what
   snapshots exist. The app's `src/driveLoader.js` fetches it at runtime via
   `https://raw.githubusercontent.com/frolovdo/bodyj4you/main/data/supply-chain/manifest.json`.
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

The sync needs:

| Variable | Where it lives | What it is |
| --- | --- | --- |
| `GDRIVE_FOLDER_ID` (here) / `SUPPLY_CHAIN_GDRIVE_FOLDER_ID` (runner) | this folder's `.env`; `automation/.env` for the runner | The Drive folder ID (the part after `/folders/` in the URL). Currently: `1WILT2WleC0ztjwdgNo1-cvFrrBcwcK3e` |
| `GDRIVE_SA_KEY` | this folder's `.env`; `automation/.env` for the runner | The full service-account JSON, on a single line. Reuses the same secret as the miami/china dashboards. |

Steps:

1. In Google Cloud Console, create a service account (or reuse the one already used by your
   `miami-dashboard` / `china-dashboard`). Download its JSON key.
2. Share the Drive folder with the service account's email, **Viewer** access.
3. Copy `.env.example` → `.env` and fill both vars (and the same values in `automation/.env` for the runner).

## Running the sync

```
npm run sync          # local (reads .env)
npm run sync:ci       # reads env vars directly (used by automation/local-runner.mjs)
```

`node automation/local-runner.mjs run supply_chain` runs the sync and commits any changes under
`data/supply-chain/` back to `main`, which triggers Netlify to redeploy.

## Things you may want to edit

- `src/lib/format.js` — `coverage()` defines the days-covered color buckets (≤14 red, ≤30
  orange, ≤60 yellow, else green) and the OUT OF STOCK / No Demand logic.
- `src/pdf.js` — `SUPPLIER` constant and the PO PDF layout.

## Architecture notes

- The dashboard is a **renderer** — every number comes from a cell in the xlsx. It does not
  recompute velocity, days, or reorder quantities. The `component-reorder` skill owns the math.
- Snapshots are immutable on disk; the cart is wiped when you switch snapshots because unit
  costs can change week to week.
- The legacy `src/components/UploadZone.jsx` is not wired into the app but is kept in the repo
  in case you want to add a "load local file" fallback later.
