# BodyJ4You China Weekly Reorder Dashboard + Shipment Builder - Build Spec

## Overview

A client-side web app, two pages:

1. **Dashboard** — user uploads the China Weekly Reorder xlsx, sees it as a
   styled dashboard (same look as the existing Miami dashboard). Each row has
   an editable quantity field and an "Add to FBA Shipment" button.
2. **Shipment Builder** — collects the items the user added, lets them
   review/edit/remove, and exports an Amazon "Send to Amazon" manifest xlsx.

The China xlsx is generated upstream by the `inventory-reorder` skill. The
web app's job is to visualize it and build a shipment from selected rows.

## Hard rules (non-negotiable)

1. **The uploaded xlsx is the only source of truth.** The app reads cells
   and renders them. It does NOT recompute velocity, days, totals, or
   section assignment. Those are columns in the file.
2. **No backend.** Pure client-side. File upload + manifest export both
   happen in the browser.
3. **No persistence required.** The shipment cart lives in React state /
   memory for the session. (Optional: sessionStorage so a refresh doesn't
   lose the cart — nice-to-have, not required.)
4. **The manifest export uses the FBA SKU, never the display SKU.** This is
   the core requirement. See "Manifest export" below.

## Tech stack

- React + Vite (TypeScript preferred)
- `xlsx` (SheetJS) for both reading the upload and writing the manifest
- Plain CSS or Tailwind. Reference styles from the Miami prototype HTML.
- Routing: a lightweight router (react-router) OR simple state-based view
  switching. Two views: "dashboard" and "shipment". Your call.
- Static hosting (Vercel / Netlify / GitHub Pages)

## Input file structure

The user uploads the China Weekly Reorder xlsx. Two sheets.

### Sheet 1: "China Reorder"

Row 1 = headers. Rows 2+ = data, one row per SKU.

| Col | Header             | Type    | Notes                                              |
|-----|--------------------|---------|----------------------------------------------------|
| A   | Section            | string  | China block: "PL6328 TAPER PLUGS" / "GK GAUGES & KITS" / "PJ + FJ JEWELRY" / "NC CHOKERS" |
| B   | SKU                | string  | Display SKU — shown in the dashboard               |
| C   | FBA SKU            | string  | **Merchant SKU — used in the manifest export**     |
| D   | ASIN               | string  | Amazon ASIN                                        |
| E   | Parent ASIN        | string  | Parent SKU name (can be empty)                     |
| F   | Category           | string  | "GK" / "PJ" / "FJ" / "NC" / etc.                   |
| G   | Available          | number  | Units available at FBA                             |
| H   | Inbound            | number  | Units in transit                                   |
| I   | Reserved           | number  | Units reserved                                     |
| J   | Amazon Days        | number  | Raw days-of-supply from Amazon                     |
| K   | Display Days       | number  | Pre-computed days for the bar                      |
| L   | Out Of Stock       | boolean | TRUE if Available = 0                              |
| M   | Weighted Velocity  | number  | Daily units (decimal)                              |
| N   | Min Level          | number  | FBA minimum inventory level                        |
| O   | Status             | boolean | TRUE/FALSE                                         |
| P   | QTY                | number  | Suggested reorder quantity                         |

### Sheet 2: "Summary"

Row 1 = headers. Rows 2+ = data.

| Col | Header      | Type   | Notes                                        |
|-----|-------------|--------|----------------------------------------------|
| A   | Section     | string | Block label, or "GRAND TOTAL"                |
| B   | SKU Count   | number | SKUs in this block                           |
| C   | Total Units | number | Sum of QTY for this block                    |

Has one row per China block plus a "GRAND TOTAL" row.

## Page 1: Dashboard

### Layout

Match the Miami dashboard styling exactly (provided as `China_Weekly_Viewer.html`
— lift its CSS). Differences from Miami:

- Title: "China Weekly Reorder"
- The 5 stat cards are: Total Units, then the 4 China blocks (PL6328, GK,
  PJ+FJ, NC). Values come from the Summary sheet.
- Filter pills: All / PL6328 / GK / PJ+FJ / NC
- Block accent colors: PL6328 `#0891b2`, GK `#7c3aed`, PJ+FJ `#db2777`,
  NC `#ea580c`
- Section header rows (dark navy band) use the China block label + count +
  units from the Summary sheet

### Table columns (5 visual blocks)

| Block     | Columns                          | Tint     |
|-----------|----------------------------------|----------|
| Product   | SKU, ASIN, Parent, Cat           | indigo   |
| Inventory | Available, Inbound, Reserved     | green    |
| Demand    | Days (bar), Velocity             | red      |
| Reference | Min, Status                      | gray     |
| Action    | **Qty input + Add button**       | yellow   |

The **Action block is new**. Instead of just showing QTY, it has:
- A number input, pre-filled with the row's `QTY` value, editable
- An "Add to FBA Shipment" button next to it

```
┌─────────────── Action ───────────────┐
│  [  90  ]   [ + Add to Shipment ]     │
└───────────────────────────────────────┘
```

### Days column

Same as Miami:
- `Out Of Stock = TRUE` → red "OUT OF STOCK" badge, no bar
- Otherwise → bar scaled 0-60, color red <30 / yellow 30-45 / green 45+,
  tick at the 30-day midpoint, big bold `{Display Days}d` number on the right
- Read `Display Days` directly from the cell. Do NOT compute it.

### Add-to-shipment behavior

When the user clicks "Add to FBA Shipment" on a row:
1. Read the current value of that row's quantity input
2. Add an entry to the shipment cart:
   ```ts
   {
     fbaSku: row['FBA SKU'],   // <- the Merchant SKU, NOT the display SKU
     displaySku: row['SKU'],   // keep for showing in the cart UI
     asin: row['ASIN'],
     category: row['Category'],
     quantity: <value from the input>,
   }
   ```
3. Give visual feedback: the row gets a subtle "added" state (e.g. a green
   check, or the button changes to "Added ✓ / Update"), and a cart badge
   in the header increments.
4. If the same SKU is added again, UPDATE the existing cart entry's quantity
   rather than creating a duplicate. (Match on `fbaSku`.)

### Cart indicator

Persistent in the header: a button/badge showing
`Shipment (N items)` that navigates to Page 2. N = number of distinct SKUs
in the cart.

## Page 2: Shipment Builder

### Layout

A simple review table of everything in the cart:

| Column        | Source                   | Editable |
|---------------|--------------------------|----------|
| Display SKU   | cart entry displaySku    | no       |
| FBA SKU       | cart entry fbaSku        | no       |
| ASIN          | cart entry asin          | no       |
| Category      | cart entry category      | no       |
| Quantity      | cart entry quantity      | **yes**  |
| (remove)      | —                        | button   |

- Quantity is editable here too (number input). Editing updates the cart.
- Each row has a remove (×) button.
- Show a total: "N SKUs · M total units".
- A "Back to Dashboard" link (cart persists).
- A "Form FBA Shipment" button (primary action). Disabled if cart is empty.
- A "Clear Shipment" button (secondary, with a confirm).

### "Form FBA Shipment" → manifest export

Clicking it generates and downloads an xlsx in Amazon's "Send to Amazon"
manifest format. **This is the critical output — get the format exactly right.**

The reference template is `ManifestFileUpload_Template_MPL.xlsx` (provided).
The export must reproduce the **"Create workflow – template"** sheet:

- Create a workbook with ONE sheet named exactly: `Create workflow – template`
  (note: that's an en-dash `–`, U+2013, not a hyphen)
- **Row 6**: header row. `A6 = "Merchant SKU"`, `B6 = "Quantity"`
- **Row 7 onward**: one row per cart item:
  - Column A = the cart entry's **`fbaSku`** (the FBA SKU / Merchant SKU)
  - Column B = the cart entry's **`quantity`**
- Rows 1-5 above the header: the template has instructional text in A1.
  Reproduce row 1 text if you can extract it from the template, otherwise
  leave rows 1-5 blank — Amazon only requires the header at row 6 and data
  below. (Match the template if practical; blank is acceptable.)
- The optional columns (Expiration date, Manufacturing lot code, Units per
  box, Number of boxes, Box dimensions, Box weight) are left out / blank.
  We do not collect those.
- Filename: `FBA_Shipment_<YYYY-MM-DD>.xlsx`

```
Manifest xlsx structure:
┌─────────────────────────────────────────┐
│ Sheet: "Create workflow – template"     │
│                                         │
│ Row 1-5:  (template preamble or blank)  │
│ Row 6:    Merchant SKU | Quantity       │
│ Row 7:    PL6328-00G_FBA | 90           │
│ Row 8:    GK0278_FBA     | 20           │
│ Row 9:    ...                           │
└─────────────────────────────────────────┘
```

**Why FBA SKU and not display SKU:** the dashboard shows the regular SKU
(`PL6328-00G`) because that's what the operator recognizes. But Amazon's
shipment system needs the Merchant SKU (`PL6328-00G_FBA`). The xlsx carries
both columns precisely so the dashboard can show one and the export can use
the other. The app must NEVER put the display SKU in the manifest.

## App flow

1. Empty state: upload zone. "Upload your China Weekly Reorder xlsx."
2. Parse with SheetJS, validate both sheets + required columns.
3. Error state on bad file: clear message, "try a different file."
4. Dashboard renders. User adjusts quantities, clicks Add on rows.
5. User navigates to Shipment Builder via the header cart button.
6. User reviews, edits quantities, removes items.
7. User clicks "Form FBA Shipment" → manifest xlsx downloads.
8. "Swap file" available from the dashboard (returns to empty state, with
   a confirm if the cart has items).

## Reference: parse the upload

```ts
import * as XLSX from 'xlsx';

interface ChinaRow {
  Section: string;
  SKU: string;
  'FBA SKU': string;
  ASIN: string;
  'Parent ASIN': string;
  Category: string;
  Available: number;
  Inbound: number;
  Reserved: number;
  'Amazon Days': number;
  'Display Days': number;
  'Out Of Stock': boolean;
  'Weighted Velocity': number;
  'Min Level': number;
  Status: boolean;
  QTY: number;
}

interface SummaryRow {
  Section: string;
  'SKU Count': number;
  'Total Units': number;
}

async function parseFile(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.SheetNames.includes('China Reorder'))
    throw new Error('Missing sheet "China Reorder"');
  if (!wb.SheetNames.includes('Summary'))
    throw new Error('Missing sheet "Summary"');

  const data = XLSX.utils.sheet_to_json<ChinaRow>(wb.Sheets['China Reorder']);
  const summary = XLSX.utils.sheet_to_json<SummaryRow>(wb.Sheets['Summary']);

  const required = [
    'Section','SKU','FBA SKU','ASIN','Parent ASIN','Category',
    'Available','Inbound','Reserved','Amazon Days','Display Days',
    'Out Of Stock','Weighted Velocity','Min Level','Status','QTY',
  ];
  if (data.length) {
    const cols = Object.keys(data[0]);
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length)
      throw new Error(`China Reorder sheet missing columns: ${missing.join(', ')}`);
  }
  return { data, summary };
}
```

## Reference: cart model

```ts
interface CartItem {
  fbaSku: string;       // goes in the manifest Merchant SKU column
  displaySku: string;   // shown in cart UI
  asin: string;
  category: string;
  quantity: number;
}

// Add or update by fbaSku
function addToCart(cart: CartItem[], item: CartItem): CartItem[] {
  const idx = cart.findIndex(c => c.fbaSku === item.fbaSku);
  if (idx >= 0) {
    const next = [...cart];
    next[idx] = { ...next[idx], quantity: item.quantity };
    return next;
  }
  return [...cart, item];
}
```

## Reference: manifest export

```ts
import * as XLSX from 'xlsx';

function exportManifest(cart: CartItem[]) {
  // Build an array-of-arrays so we control exact cell placement.
  const rows: (string | number)[][] = [];
  rows[0] = ['Send to Amazon manifest — generated from China Weekly Reorder'];
  // rows 1-4 left blank
  rows[5] = ['Merchant SKU', 'Quantity'];   // row 6 (0-indexed 5)
  cart.forEach((item, i) => {
    rows[6 + i] = [item.fbaSku, item.quantity];   // row 7+
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Create workflow – template');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FBA_Shipment_${date}.xlsx`);
}
```

Note the sheet name uses an en-dash. Copy it exactly: `Create workflow – template`.

## Component structure (suggested)

```
src/
  main.tsx
  App.tsx                  <- view state (dashboard|shipment), cart state, file state
  views/
    DashboardView.tsx
    ShipmentView.tsx
  components/
    UploadZone.tsx
    StatCards.tsx          <- 5 cards from Summary sheet
    FilterPills.tsx
    ScaleKey.tsx
    ReorderTable.tsx       <- table; each row has qty input + Add button
    ReorderRow.tsx         <- single row, owns its qty input state
    DaysBar.tsx
    CartButton.tsx         <- header cart indicator
    ShipmentTable.tsx      <- page 2 review table
    ErrorBanner.tsx
  lib/
    parseFile.ts
    exportManifest.ts
    cart.ts
  types.ts
  styles.css               <- from China_Weekly_Viewer.html <style> block
```

## Acceptance criteria

1. Uploading `Reorder_China__05_12_26.xlsx` renders a dashboard matching
   `China_Weekly_Viewer.html` visually.
2. Stat cards show Total 4,300 units / 53 SKUs and the four block counts,
   all from the Summary sheet.
3. Each data row has an editable quantity input pre-filled with the QTY
   cell value, plus an "Add to FBA Shipment" button.
4. Adding a row puts `{FBA SKU, quantity}` in the cart; the header cart
   badge increments; re-adding the same SKU updates instead of duplicating.
5. The Shipment Builder page lists added items with editable quantities and
   remove buttons, and a running total.
6. "Form FBA Shipment" downloads an xlsx with sheet
   `Create workflow – template`, headers at row 6 (`Merchant SKU`,
   `Quantity`), data from row 7, and **column A contains the FBA SKU**
   (e.g. `PL6328-00G_FBA`), not the display SKU (`PL6328-00G`).
7. Malformed upload shows a clear error, no crash.

## Non-goals (explicit DO NOT)

- Do NOT recompute velocity, days, totals, or sections — read from cells.
- Do NOT put the display SKU in the manifest. Manifest = FBA SKU only.
- Do NOT collect box dimensions / expiration / lot codes. Only SKU + Qty.
- Do NOT add login, accounts, or a backend.
- Do NOT add charts/analytics. Dashboard + shipment builder only.
- Do NOT persist data server-side.

## Deliverables

1. Working React app (`npm run dev`)
2. Production build (`npm run build` → static `dist/`)
3. README: install, dev, build, deploy
4. CSS extracted from the China prototype HTML
