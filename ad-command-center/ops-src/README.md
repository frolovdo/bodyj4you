# BodyJ4You Ops tool — source and status

**Operator link:** https://bodyj4you-ops-briefing.netlify.app (PIN login; PIN set with `node scripts/ops-set-pin.mjs <PIN>`).
**Owner copy:** claude.ai artifact https://claude.ai/artifact/Lc3twVXq84CQanQopchsgk (same page, talks to Supabase through the connector).

## Files here
| File | What it is |
|---|---|
| `ops-briefing.html` | The page source. One file serves both copies. Edit this, never `public/ops/index.html`. |
| `export_web.py` | Copies the source to `public/ops/index.html` (adds noindex). Then deploy the site. |
| `proxy-site/_redirects` | The whole `bodyj4you-ops-briefing` Netlify site: a proxy to `/ops` and `/api/*` on the Action Center site. |
| `set_ops_secrets.py` | Copies Walmart + TikTok keys from this Mac into GitHub secrets (names only printed). |
| `set_ebay_secrets.py` | Copies eBay keys from `~/.ebay/creds.json` into GitHub secrets. |

Publish: `python3 ops-src/export_web.py` → `npx netlify deploy --build --prod --message "…" < /dev/null` (from `ad-command-center`), and republish the artifact from `ops-briefing.html`.

## How it fits together
- **Web API:** `netlify/functions/ops-api.mjs` (named actions; list must match `ACT` in the page), `ops-login.mjs`, `ops-me.mjs`, `netlify/lib/opsauth.mjs`.
- **Data:** Supabase project ad-command-center: `ops_snapshot`, `ops_refresh`, `ops_orders`, `ops_log`, `ops_inbound`, `ops_addresses`, `ops_market`, `ops_tokens`, `ops_auth`/`ops_sessions`.
- **Jobs:** repo `bodyj4you-amazon-api` (`~/sp-api`), folder `ops/`:
  - Pull: page → `ops_refresh` row → `ops-dispatch` → GitHub `ops-refresh.yml` → `ops_refresh.py` (Amazon lists, holds, TikTok + Walmart lists, inbound sync, marketplace check).
  - Create shipment: `ops_refresh` row kind `ship` → `ops_ship.py` (Amazon Send to Amazon plan, or Walmart WFS inbound order via `walmart_sync.py`).
  - Marketplace alerts: Mac launchd (`~/sp-api/tools/macjobs`), 4x/day 04:20/10:20/16:20/22:20 Pacific → `market_sync.py` → `ops_market`.

## Status (2026-10-17)
Live:
- Inventory: Miami / China (holds for Bony) / Walmart / TikTok. Walmart + TikTok use all-order 30-day sales and list "New to WFS / New to FBT" candidates under the running-short items.
- Create FBA shipment (Miami cart, China hold), Create Walmart (WFS) shipment (API), TikTok opens FBT "Create inbound order" + Copy list.
- Inbound shipments page (Amazon, Walmart WFS, TikTok FBT), with Reconcile flag.
- Marketplace alerts: open orders we ship ourselves on Walmart, eBay, TikTok, Amazon MFN, Mercado Libre; late = past ship-by.
- Orders & log; Send to Bony (Gmail on claude.ai; Gmail draft + xlsx download on web).

Not done / open:
- Walmart WFS create has not been used for real yet (request verified by dry run only). Seller Center link goes to the home page (exact WFS page unverified).
- Returns (Customer page): live since 2026-10-19 — FBA returns report, 90 days, per ASIN, refreshed by each Pull (`ops/returns_sync.py`).
- No Miami shelf stock visibility.
- 7 SKUs with $0 cost; cost disagreements EO-ROSEHIP-16oz, EO-JOJOBA-16Oz.
- KT8100 shows on the Walmart list though it was zeroed on Walmart seller-fulfilled — owner to decide.
- Website (Shopify) order alerts: dropped by the owner.
