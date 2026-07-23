# Creator Partnership Page — Full Handoff

_Last updated: 2026-06-12_

Free-gift page where creators pick **one** free product, provide socials + sign an
agreement, and check out at **$0** through Shopify's native cart/checkout. No backend.

- **Store:** BodyJ4you (`www.bodyj4you.com`), theme **Sleek** (Online Store 2.0)
- **Live page:** https://www.bodyj4you.com/pages/partnership
- **Repo:** `frolovdo/bodyj4you`, branch `claude/shopify-creators-partnership-page-EpUUF`
- **Folder:** `creators-partnership/`
- **Main file:** `creators-partnership/creator-gifts-section.liquid`

---

## 1. How it works (architecture)
- The gift items are **real products priced $0.00** ("clones" of catalog items), so
  there's nothing to override and **no coupon** needed.
- They live in the **"Creator Gifts"** collection (`creator-gifts`).
- The page is a single **Custom Liquid section** pasted into the Partnership page via
  **Online Store → Themes → Edit theme → Pages: Partnership → Add section → Custom Liquid**.
  (Custom Liquid is required because it preserves the `<script>`; the page's rich-text
  HTML editor strips scripts.)
- Flow: creator picks 1 product → JS adds it to the **native cart** + writes socials/
  agreement as **cart attributes** → redirect to **/checkout** → $0 total → free shipping →
  **Paid order**.
- Captured on the order ("Additional details"): `Creator gift: Yes`,
  `Influencer agreement: Accepted`, `Instagram` / `TikTok` / `YouTube` / `Other`.

## 2. Page behavior (in the Liquid)
- **Single-select** product tiles (mobile-first: 2-up, big image, small text, FREE badge,
  orange accent `#f5631e`).
- Checkout button **"Create & ship my partner box 🎁"** at the bottom, **disabled until**:
  1 product selected **+** at least one **valid** Instagram/TikTok/YouTube handle
  (lenient regex, must contain a letter — rejects junk like `123123`; "Other" doesn't count)
  **+** agreement checkbox checked.
- Agreement **"Read & sign"** opens the Google Form:
  `https://docs.google.com/forms/d/e/1FAIpQLSfRW-3NKnnzOcFAwP35nQCw08C0Fs3_qOi1o6Y4r7ej54ImeA/viewform`
  (editable on line 3 of the liquid).

## 3. Products created ($0 clones — ACTIVE, untracked, tagged `creator-gift`)
Collection: **Creator Gifts** — `gid://shopify/Collection/523967168795`

| Product | Gift SKU | Variant ID | Real twin's Amazon SKU |
|---|---|---|---|
| HOCl Face Spray 4 Fl Oz | `HA-4oz-SP-GIFT` | 52300379816219 | `HA-4oz-SP` |
| Piercing Aftercare Kit (drops+oil) | `HB0017-GIFT` | 52300380176667 | `HB0017_FBA` |
| Ear Stretching Balm | `HB0005-GIFT` | 52300380307739 | `HB0005_PRG` |
| Piercing Aftercare Saline Spray 2 Fl Oz | `HS0002-GIFT` | 52300888899867 | `HS0002_FBA` |
| Piercing Bump Care Oil 0.33 Fl Oz | `PB-10-GIFT` | 52300888965403 | `PB-10_FBA` |
| Organic Castor Oil 1 Fl Oz | `EO-CASTOR-1oz-GIFT` | 52300889030939 | `EO-CASTOR-1oz` |
| Organic Jojoba Oil 1 Fl Oz | `EO-JOJOBA-1oz-GIFT` | 52300889129243 | `EO-JOJOBA-1oz` |
| Organic Rosehip Oil 1 Fl Oz | `EO-ROSEHIP-1oz-GIFT` | 52300889194779 | `EO-ROSEHIP-1oz_FBA` |

To add more gifts: duplicate a catalog product → price $0 → tag `creator-gift` → add to
the Creator Gifts collection → stock at **Amazon MCF only** (see §4). Page updates itself.

## 4. Inventory location (DONE)
All 8 gift products are stocked at **Amazon MCF only**
(`gid://shopify/Location/87144530203`) — removed from HBJ Warehouse and Amazon
Fulfillment. This fixed the "**can't ship to your address**" error (HBJ wasn't in a
shipping zone that served $0 orders).
- Other locations: HBJ Warehouse `64263880751`, Amazon Fulfillment `100721721627`,
  Default Warehouse `21351876`.

## 5. Shipping rates (DONE)
Delivery profile: **General profile** `gid://shopify/DeliveryProfile/17738072111`.
- **Domestic** zone `gid://shopify/DeliveryZone/35344285743` (group `17759109167`):
  - **Free Shipping (Creator Gift)** $0 — applies only when subtotal **= $0** ✅ (added)
  - Expedited $12.99 — now requires subtotal **≥ $0.01** (so $0 orders don't see it)
  - Standard Overnight $69.99 — now requires subtotal **≥ $0.01**
  - Free Standard $0 — requires ≥ $29.99 (unchanged)
- Net effect: a **$0 creator order sees only the free rate**; normal paying orders unchanged.

## 6. Tested — WORKS end to end ✅
Order **#43483**: $0.00, **Paid**, **Free Shipping (Creator Gift)**, with
`Instagram @gabdelfet`, `Influencer agreement: Accepted`, `Creator gift: Yes`.
The picker → cart attributes → $0 paid order flow is confirmed working.

---

## 7. OPEN ITEMS / DECISIONS PENDING

### A. Auto-fulfillment hold (manual approval) — NOT set up yet  ⬅ do this first
Goal: every gift order is **held** for operator approval (and this also stops the auto-
request to Amazon that currently fails — see B).
**Set up in the Shopify Flow app:**
- Trigger: **Order created**
- Condition: **Order line items → Product → Tags contains `creator-gift`**
- Action: **Hold fulfillment order** (reason e.g. "Creator gift — needs approval")
Operator then: **Release hold → Mark as fulfilled** (hand-ship) or **Request fulfillment**
(if Amazon MCF is verified, see B).

### B. Fulfillment method — DECISION NEEDED
Order #43483's Amazon request was **declined: "invalid SkuMapping."** Cause: the gift SKUs
aren't **Verified** in the Amazon MCF / Buy with Prime app (status was **"Matched," not
Verified"**; verification can take up to 24h), and gift + real products map to the **same**
Amazon SKU (Amazon flags this for manual review).
- **Option 1 — Amazon MCF fulfills:** finish mapping each gift SKU → its real Amazon SKU
  (table in §3), activate MCF, wait for **Verified**, then test a **fresh** order.
  Caveat: each freebie **draws down real FBA inventory**.
- **Option 2 — Hand-fulfill (simplest):** ignore Amazon; operator uses **"Mark as
  fulfilled"** and ships from own stock. No SKU mapping, no waiting.

### C. Abuse risk — DECISION NEEDED
The page gating is **client-side only**. The $0 products are publicly purchasable, so
someone could go straight to a product URL, **add any quantity, and check out free without
the form**. JS can't prevent this.
- **Backstop (recommended, low effort):** the **Flow hold** (item A) means any abusive order
  is **$0, held, and cancelled on review** — nothing ships, nothing lost.
- **Optional no-code:** a Shopify App Store **"quantity limit / order limit"** app to cap
  each gift at qty 1 at the cart.
- **Hard fix (attempted, parked):** a custom **Checkout Validation Function** to block bad
  carts at checkout. Setup got heavy and was paused — blockers hit: needs a **Shopify
  Partners org** (not yet created/confirmed) and a macOS **npm global permission error**
  (`EACCES`; fix is `sudo npm install -g @shopify/cli@latest`). Recommendation was to skip
  this and rely on the hold (+ optional quantity app).

---

## 8. Recommended next steps (in order)
1. **Set up the Flow hold** (§7A) — covers both the Amazon auto-decline and the abuse impact.
2. **Pick a fulfillment method** (§7B) — hand-fulfill is simplest; MCF needs SKU verification.
3. **(Optional) quantity-limit app** (§7C) if you want to cap qty at the cart.
4. **(Optional) polish:** restyle the block to match the page; hide gift products from
   search/nav to reduce discovery.

## 9. Quick reference (IDs)
- Collection: `gid://shopify/Collection/523967168795` (`creator-gifts`)
- Delivery profile: `gid://shopify/DeliveryProfile/17738072111`
- Domestic zone: `gid://shopify/DeliveryZone/35344285743` / group `17759109167`
- Amazon MCF location: `gid://shopify/Location/87144530203`
- Free gift rate: `gid://shopify/DeliveryMethodDefinition/1179578007835`
