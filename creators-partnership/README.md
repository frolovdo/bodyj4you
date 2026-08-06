# Creator Gifts page (Shopify — no app, no backend, no coupon)

Creators pick free products, fill in their socials + agreement, and check out
through Shopify's normal checkout. They get a **$0, paid, ready-to-fulfill order**.

## How it works
The products in the **Creator Gifts** collection are real products priced at
**$0.00** (clones of catalog items). So there's nothing to "overwrite" and no
coupon needed:

```
Creator page (one Custom Liquid block)
   pick items  ──►  add to NATIVE cart  +  stash socials/agreement as cart attributes
                         │
                         ▼
              Shopify's normal /checkout
              collects shipping/contact, total is $0
                         │
                         ▼
              Paid $0 order, ready to fulfill (you approve/ship)
```

No server, no secret token, no Shopify app. Everything runs on Shopify's native
storefront cart + checkout.

## What's already set up in your store
- Collection: **Creator Gifts** (`creator-gifts`)
- 3 demo $0 clone products in it:
  - `[Creator Gift] Hypochlorous Acid Face Spray - 4 Fl Oz`
  - `[Creator Gift] Piercing Aftercare Kit, Saline Drops + Bump Oil`
  - `[Creator Gift] Ear Stretching Balm`

Add more gifts anytime: duplicate a catalog product, set its price to `$0.00`,
tag it `creator-gift`, and add it to the **Creator Gifts** collection. The page
updates automatically — no code changes.

## Install the page (2 minutes)
1. **Online Store → Themes → Customize.**
2. Create/open the page you want (or add a new Page in admin first, e.g. "Creators").
3. **Add section → Custom Liquid.**
4. Paste the entire contents of `creator-gifts-section.liquid` into the box. **Save.**

That's it. (Custom Liquid keeps the `<script>` intact — pasting into a normal
page's rich-text editor would strip it, so use the Custom Liquid section.)

Optional tweaks at the top of the file:
- `max_items` — how many products a creator can pick (default 5).
- `agreement_url` — link behind the "Read" link (point it at a Page with your
  influencer agreement text).

## Where the creator's info lands
- **Shipping/contact:** collected by Shopify's normal checkout → on the order.
- **Socials + agreement:** saved as **cart attributes**, visible on the order under
  "Additional details" (Instagram, TikTok, YouTube, Other, Influencer agreement,
  and a `Creator gift: Yes` marker).

## Good to know / tradeoffs
- **Inventory is separate.** The $0 clones are their own products, so they don't
  share stock with the original catalog items. Since you approve/fulfill manually,
  you manage this by hand.
- **Discoverability.** The clones are ACTIVE so they can be added to the cart. They
  aren't linked in your nav, but a determined visitor could find them. For tighter
  control later, options include: hiding them from search, gating the page, or
  moving to a server-side flow. Fine for a soft launch with manual approval.
- **Tag orders automatically (optional).** Set up a free Shopify **Flow**: "Order
  created → if has attribute `Creator gift = Yes` → add order tag `creator-gift`",
  so these orders are easy to filter.

## Files
| File | Purpose |
|------|---------|
| `creator-gifts-section.liquid` | The whole page — paste into a Custom Liquid section |
| `CONTINUE_HERE.md` | Status + next steps |
