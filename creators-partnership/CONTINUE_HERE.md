# Continue Here (Desktop Handoff)

Everything for the **creators partnership page** is already built, committed, and
pushed. This file is your pick-up point when you switch to desktop.

## Where things are

- **Branch:** `claude/shopify-creators-partnership-page-EpUUF` (already pushed)
- **Folder:** `creators-partnership/`
- **Repo:** `frolovdo/bodyj4you`

To get it on desktop:
```bash
git fetch origin
git checkout claude/shopify-creators-partnership-page-EpUUF
git pull
```

## What's done ✅

The full code is written and syntax-checked:

| File | Purpose |
|------|---------|
| `creators-partnership/theme/sections/creators-partnership.liquid` | The page UI: product grid (from a collection) + selection + form |
| `creators-partnership/theme/templates/page.creators.json` | Page template that loads the section |
| `creators-partnership/theme/assets/creators-partnership.js` | Select 1–5 products, build cart, submit form |
| `creators-partnership/theme/assets/creators-partnership.css` | Minimal styling (design later) |
| `creators-partnership/backend/server.js` | App Proxy endpoint: verify → validate → create order |
| `creators-partnership/backend/shopify.js` | Admin API calls: customer + $0 draft order + complete as paid |
| `creators-partnership/backend/package.json` / `.env.example` | Backend deps + config template |
| `creators-partnership/README.md` | Full technical reference |

**The flow:** creator picks free catalog products → fills shipping + socials +
agreement → backend creates a normal **$0, already-paid order** (price overwritten
via a 100% server-side discount, no coupon) → flows into standard fulfillment.
Socials + agreement are saved on the customer as metafields and mirrored onto the order.

## What's left to do 🔲 (in order)

### 1. Re-authorize the Shopify connection (the blocker right now)
The Shopify MCP token expired. On desktop, in Claude Code run:
```
/mcp
```
Pick the Shopify server → re-authenticate → approve in browser. Then tell me
"re-authed" and I'll create the collection + demo products and verify wiring.

> Steps 2–5 below are the real Shopify setup. I can do the Shopify-side parts
> (collection/products) once you've re-authed; the app + deploy parts are yours.

### 2. Create the custom app (gets your API credentials)
Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app**.
- Admin API scopes: `read_customers`, `write_customers`, `write_draft_orders`,
  `write_orders`, `read_products`
- Install it, then copy the **Admin API access token** and the **API secret key**.

### 3. Deploy the backend
```bash
cd creators-partnership/backend
cp .env.example .env     # fill in shop domain, admin token, api secret
npm install
npm start                # test locally
```
Then deploy to any Node host (Render / Railway / Fly / a VM) and note its HTTPS URL.
> Tell me if you want a one-click deploy config (Render or Railway) — I'll add it.

### 4. Set up the App Proxy (keeps it native to your domain)
In the app config → **App proxy**:
- Subpath prefix: `apps`
- Subpath: `creators`
- Proxy URL: your deployed backend URL

This makes the storefront call `/apps/creators/order` on your own domain.

### 5. Install the theme files + create the page
- Copy the 4 files from `creators-partnership/theme/` into your live theme
  (`sections/`, `templates/`, `assets/`) — via Shopify CLI or the theme code editor.
- Create a **"Creator Gifts"** collection and add the products you want to give away.
- Create a **Page** in admin and assign it the **"creators"** template.
- In the theme editor, open that page and set **Gift collection** + heading +
  the **influencer agreement link**.

## Open questions for me (answer on desktop)
1. Want me to add a **Render/Railway deploy config** so the backend is one-click?
2. Once re-authed: should I **seed demo products** into a Creator Gifts collection,
   or will you point me at existing catalog items to add?
3. Want a basic **anti-abuse guard** on the endpoint (it creates free orders) before
   this goes public?

— Pick up by re-authing the Shopify MCP, then ping me.
