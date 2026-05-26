# China Weekly Reorder + FBA Shipment Builder

A two-page client-side React app for the BodyJ4You China weekly reorder workflow:

1. **Dashboard** — upload the China Weekly Reorder xlsx, view it as a dashboard, edit per-row quantities, and add SKUs to an FBA shipment cart.
2. **Shipment Builder** — review the cart, edit quantities, remove items, and export an Amazon "Send to Amazon" manifest xlsx.

Built per `china_dashboard_spec.md`. Visual style matches the Miami dashboard (same compact / detail toggle, sticky header, hero stat).

## Stack

- React 18 + Vite 5 (JavaScript)
- `xlsx` (SheetJS) for both reading the upload and writing the manifest
- Plain CSS, no UI library
- No backend, no auth, no persistence

## Project layout

```
china-dashboard/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx                  # view + cart + file state
    ├── parseFile.js             # xlsx parse + column validation
    ├── exportManifest.js        # Amazon manifest xlsx writer
    ├── cart.js                  # add/update/remove by fbaSku
    ├── sections.js              # 4 China block definitions
    ├── styles.css
    ├── views/
    │   ├── DashboardView.jsx
    │   └── ShipmentView.jsx
    └── components/
        ├── UploadZone.jsx
        ├── ErrorBanner.jsx
        ├── StatCards.jsx        # hero + 4 chips from Summary sheet
        ├── FilterPills.jsx      # All / PL6328 / GK / PJ+FJ / NC
        ├── ScaleKey.jsx
        ├── ReorderTable.jsx     # sectioned table; compact (6 cols) or detail (13 cols)
        ├── ReorderRow.jsx       # owns local qty input; renders Add/Update/✓ Added button
        ├── DaysBar.jsx
        └── CartButton.jsx       # header cart indicator with badge
```

## Install / dev / build

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # → dist/
```

Deploy `dist/` to any static host (Netlify drop, Vercel, GitHub Pages, S3 + CloudFront).

## How it works

### Dashboard

- Upload the xlsx via the empty-state drop zone.
- Hero card shows total units · SKU count · block count (all from the Summary sheet — never recomputed).
- 4 colored chips, one per China block (PL6328 cyan / GK violet / PJ+FJ pink / NC orange).
- Filter pills toggle visibility of sections. Pills do not recompute totals.
- Table defaults to **Compact mode** (6 cols): SKU+status dot · FBA SKU · Stock · Velocity · Days · Action.
- **Detail mode** toggle in the header restores all 13 cols (incl. ASIN, Parent, Reserved, Min, Status TRUE/FALSE).
- **Action cell** per row: a qty number input (pre-filled with the row's QTY value, editable) + a button:
  - `+ Add` when the SKU is not yet in the cart
  - `✓ Added` (green) when it's in the cart at the same quantity
  - `Update` (indigo) when the qty input differs from the cart entry
- Re-clicking the button updates the existing cart entry (matched on FBA SKU) — never duplicates.
- OOS rows get a pale red wash and a 3px red inset stripe on the left edge.
- "Swap file" button returns to the empty state — confirms first if the cart has items.

### Shipment Builder

- Reachable from the `🛒 Shipment` button in the header (badge shows distinct SKU count).
- Summary card: total units + SKU count.
- Table: Display SKU | FBA SKU | ASIN | Category | Quantity (editable) | × remove.
- Editing the quantity here updates the cart immediately.
- **Form FBA Shipment** is the primary button (amber). It downloads an xlsx in Amazon's expected format:

#### Manifest format (critical)

| Cell | Value |
|---|---|
| Sheet name | `Create workflow – template` (with U+2013 en-dash, **not** hyphen) |
| Row 1 A1 | one-line preamble text |
| Rows 2-5 | blank |
| A6 / B6 | `Merchant SKU` / `Quantity` |
| A7+ / B7+ | the FBA SKU (column C of the upload) and the cart quantity |
| Filename | `FBA_Shipment_<YYYY-MM-DD>.xlsx` |

**The manifest never contains the display SKU.** Column A is always the FBA / Merchant SKU. This is verified end-to-end against the sample file.

## Hard rules enforced in code

- The xlsx is the only source of truth — no recomputation of velocity, days, totals, or section assignment.
- All counts in the hero/chips/section bands come from the `Summary` sheet, never from the data rows.
- `Display Days` and `Out Of Stock` are read directly from their columns; we don't derive them from Available / Velocity.
- The cart is keyed on FBA SKU. The manifest export reads `fbaSku`, never `displaySku`.
- File parsing happens entirely in the browser. Nothing is uploaded anywhere.

## Verification (against `../Reorder_China__05_12_26.xlsx`)

- Parsed: 53 SKUs across 4 blocks · grand total 4,300 units.
- Chips: PL6328 12/590 · GK 12/880 · PJ+FJ 9/1,280 · NC 20/1,550 — matches Summary sheet.
- 4 OOS rows display the red-stripe + wash.
- Manifest round-trip verified end-to-end inside the live app: A7 = `PL6328-00G_FBA` (FBA SKU), display SKU `PL6328-00G` nowhere in the output.

## Non-goals (deliberately not built)

- No box dimensions, expiration dates, manufacturing lot codes (Amazon collects those separately).
- No charts/analytics.
- No login, auth, user accounts, server persistence (other than the optional Google Drive read-only sign-in below).
- No edits to the source xlsx — read-only.
- No business-logic validation — the upstream xlsx is trusted as correct.

## Days columns

The reorder xlsx exposes two days fields:

- **Amazon Days** — Amazon's raw days-of-supply field.
- **Display Days** — our computed value (Available ÷ Weighted Velocity), and the one the upstream script uses to assign sections.

The dashboard drives everything off **Display Days**: the big number, the progress-bar width, and the red (<30) / yellow (30–45) / green (45+) color. The big number is rounded to an integer. **Amazon Days** is shown as small grey reference text beneath it (e.g. `41d` / `Amazon 41d`), with the full float in the cell's hover tooltip. The OUT OF STOCK badge is driven by the `Out Of Stock` flag column, unchanged.

## View modes

Detail mode (all 13 columns incl. FBA SKU + Status) is the **default**. The header toggle switches to a 6-column Compact view. Both modes keep the per-row quantity input + Add-to-shipment button.

## Optional: auto-load the newest file from Google Drive

The dashboard can load the most recent China reorder xlsx straight from a Drive folder instead of a manual upload. **Optional** — leave it unconfigured and the app works exactly as before (the Drive button stays hidden).

Browser-side Google Identity Services (OAuth token flow) + Drive REST API. No backend, no stored secrets.

### One-time Google Cloud setup

1. <https://console.cloud.google.com/> → create/pick a project.
2. **APIs & Services → Library →** enable **Google Drive API**.
3. **OAuth consent screen:** External (or Internal for Workspace); add yourself as a test user; add scope `.../auth/drive.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorized JavaScript origins:** your deploy URL(s) + `http://localhost:5173`.
   - Copy the **Client ID**.
5. The **folder ID** is the part after `/folders/` in the China reorder folder's URL.

### Wire it up

```bash
cp .env.example .env
# edit .env:
#   VITE_GOOGLE_CLIENT_ID=<your client id>
#   VITE_DRIVE_FOLDER_ID=<the folder id>
#   VITE_DRIVE_FILE_PREFIX=Reorder_China
npm run build
```

On Netlify, set the same three vars under **Site settings → Environment variables** and redeploy.

### Behavior

- Configured → empty state shows **"↧ Load latest from Google Drive"**; first click opens the consent popup, then the token is cached for the session.
- Return visits within the session auto-load the newest file on open.
- Newest = highest Drive `modifiedTime`, filtered to `.xlsx` starting with `VITE_DRIVE_FILE_PREFIX`.
- Scope `drive.readonly` — read-only access.
