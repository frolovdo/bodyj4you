# Creators Partnership Page (Shopify)

A native Shopify flow where creators pick free products from your real catalog,
fill in shipping + social info, accept an influencer agreement, and get a normal
**$0, already-paid order** that goes out with your standard fulfillment.

## How it works

```
Storefront page (theme)                      Backend app (Admin API)
─────────────────────────                    ─────────────────────────────
creators-partnership.liquid   ──POST──►       POST /apps/creators/order
 (grid from a collection)      (App Proxy)      1. upsert customer + socials  (metafields)
 select 1–5 → form                              2. draftOrderCreate  (100% off each line = $0)
 shipping + socials + agree                     3. draftOrderComplete(paymentPending:false)
                              ◄─orderName──         → real PAID $0 order → fulfillment
```

**Why a backend?** Overwriting prices to $0 and creating a paid order requires
the Admin API, whose token must stay secret (never in the browser). The
storefront reaches it through a **Shopify App Proxy**, so the creator stays on
your own domain (`/apps/creators/...`) and the request is signed by Shopify.

**Why no coupon?** Each draft-order line gets a server-applied 100% discount.
The creator never sees or types a code — the price is simply overwritten. Lines
still reference real catalog variants, so inventory and fulfillment behave
exactly like a normal order.

## Setup

### 1. Backend
```bash
cd creators-partnership/backend
cp .env.example .env      # fill in your values
npm install
npm start
```
Deploy it anywhere that can run Node (Render, Railway, Fly, a small VM, etc.)
and note its public HTTPS URL.

Create a **custom app** in Shopify admin (Settings → Apps → Develop apps) with
Admin API scopes: `read_customers`, `write_customers`, `write_draft_orders`,
`write_orders`, `read_products`. Copy the **Admin API access token** and **API
secret key** into `.env`.

### 2. App Proxy (makes `/apps/creators/...` work)
In your app config → **App proxy**:
- Subpath prefix: `apps`
- Subpath: `creators`
- Proxy URL: `https://YOUR-BACKEND-URL`

Now storefront calls to `/apps/creators/order` are forwarded (and signed) to
your backend's `POST /apps/creators/order`.

### 3. Theme
Copy into your theme (Online Store 2.0):
- `theme/sections/creators-partnership.liquid` → `sections/`
- `theme/assets/creators-partnership.js` → `assets/`
- `theme/assets/creators-partnership.css` → `assets/`
- `theme/templates/page.creators.json` → `templates/`

### 4. The page + product list
- Create a **collection** (e.g. "Creator Gifts") and add the products you want
  to offer. These are your normal catalog products — no duplicates needed.
- Create a **Page** in admin and assign it the **"creators"** template.
- Open the page in the theme editor and set **Gift collection** to the one above
  (plus heading, max items, and the agreement link).

## Files
| File | Purpose |
|------|---------|
| `backend/server.js` | Express endpoint: verify → validate → create order |
| `backend/shopify.js` | Admin GraphQL ops (customer, draft order, complete) |
| `theme/sections/creators-partnership.liquid` | The page UI (grid + form) |
| `theme/assets/creators-partnership.js` | Selection, cart, submit |
| `theme/assets/creators-partnership.css` | Minimal styling |
| `theme/templates/page.creators.json` | Page template wiring the section |

## Where the data lands
- **Customer**: a normal account, tagged `creator` / `creator-gift`, with
  metafields under the `creator` namespace (`instagram`, `tiktok`, `youtube`,
  `other`, `agreement_accepted`, `agreement_accepted_at`).
- **Order**: $0 total, financial status **Paid**, tagged `creator-gift`, with the
  socials + agreement mirrored into the order's custom attributes/note so your
  fulfillment team sees them at a glance.

## Notes / later
- Design is intentionally minimal — function first.
- Consider rate-limiting / a basic anti-abuse check before going public, since
  the endpoint creates free orders.
- The real influencer agreement copy can live behind the "Read" link
  (`agreement_url` setting).
