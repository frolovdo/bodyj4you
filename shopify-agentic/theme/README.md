# Agentic structured data (theme), 2026-10-17

`agentic-product-jsonld.liquid` (snippet) replaces the plain `{{ product | structured_data }}` block in
`sections/main-product.liquid`. It keeps Shopify's own Product/ProductGroup JSON and adds, in the same object:
- `aggregateRating` from the `reviews.rating` / `reviews.rating_count` metafields (Judge.me fills them)
- `additionalProperty` = the "Key Facts" list of the agentic description
and a second block `FAQPage` built from the description's FAQ section. No product data is written.

- Preview theme: "Agentic schema preview (copy of live)" id 197002625307 (unpublished copy of live 195676799259).
- `validate.py THEME_ID [handles]`: fetches every product page on that theme and checks the JSON-LD.
  Preview result: 51/51 pages parse, 51 with FAQPage, 25 with ratings (the rest have no reviews yet).
- `golive.py send | rollback`: live write and undo; before-state in ../changes/2026-10-17-live-main-product.before.liquid.
- llms.txt / agents.md / UCP endpoint are already served by Shopify itself; nothing built for those.
- `main/` = download of the live theme on 2026-10-17 (reference only).
