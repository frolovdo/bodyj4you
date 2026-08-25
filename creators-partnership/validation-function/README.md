# Creator Gift — Checkout Validation Function

Server-side enforcement that can't be bypassed from the browser. It blocks
checkout whenever a cart containing a **creator-gift** product breaks the rules:

- more than **one** gift item, or quantity **> 1**
- any **other** item in the cart alongside the gift (gift carts must be gift-only)
- missing a valid **Instagram / TikTok / YouTube** handle
- the **influencer agreement** not accepted

Carts with no gift product are ignored, so normal orders are untouched.

## How gift products are identified
Each gift product has the metafield **`custom.creator_gift = true`** (already set
on all 8 via the Admin API). The function reads it — see `src/run.graphql`. New
gift products you add must get the same metafield, or set up a metafield
definition so it's a checkbox on the product page.

## Files
- `src/run.graphql` — the input the function receives (cart lines + gift metafield + attributes)
- `src/run.js` — the rules (returns `errors` that block checkout)
- `shopify.extension.toml` — extension config (target `purchase.validation.run`)

## Deploy (Shopify CLI — the one unavoidable step)
A Function must live inside a Shopify app and be deployed with the CLI.

```bash
# 1. Have/Create an app (use your existing custom app, or):
npm init @shopify/app@latest
cd <your-app>

# 2. Scaffold a validation function so the CLI writes the CURRENT boilerplate
#    (package.json, build config) for your CLI version:
shopify app generate extension
#   -> choose "Cart and Checkout Validation"
#   -> name it "creator-gift-validation"

# 3. Replace the generated files with the ones in this folder:
#      src/run.graphql, src/run.js, shopify.extension.toml
#    (keep the generated package.json / build files)

# 4. Deploy:
shopify app deploy
```

## Turn it on
After deploy, in Shopify admin: **Settings → Checkout → Checkout rules** (a.k.a.
Validations) → make sure **"Creator gift validation"** is **Enabled**. (Some
stores auto-enable on deploy; confirm it's on.)

Optional: in the validation's settings you can choose whether checkout is
**blocked** when the function fails to run — recommend leaving the default
(do not block on error) so a function outage can't take down all checkouts.

## Test
- **Legit:** claim a gift on the Creator Partnership page → checkout succeeds.
- **Abuse — direct add:** open a gift product URL, Add to cart, go to checkout →
  blocked ("…a valid Instagram, TikTok, or YouTube is required").
- **Abuse — quantity:** set qty 5 on a gift → blocked ("Only one free creator gift…").
- **Abuse — mixed cart:** gift + a normal product → blocked ("…can only contain the one free item").

## Defense in depth
This function + the **Flow fulfillment hold** (manual operator approval) together
contain abuse fully: the function stops bad carts at the door, and anything that
slips through is a $0 order held for review with no shipment. Cart attributes are
client-settable, so the social/agreement checks are a strong deterrent; the
quantity/gift-only rules are hard guarantees.
