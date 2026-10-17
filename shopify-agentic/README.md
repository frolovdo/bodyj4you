# Shopify agentic rewrite (2026-10-16)
Shopify = BodyJ4You's agentic channel (see memory shopify-agentic-channel). All 51 active products rewritten for AI agents.
- products.json: Shopify ids + variant SKUs. pull_amazon.py -> amazon.json (Amazon bullets/attrs per SKU = fact source). packs/: per-product fact packs.
- SPEC.md: structure + compliance rules; check.py: rules checker. out/*.json: drafts by group; all_drafts.json: final pushed content.
- Pushed via Shopify connector productUpdate (descriptionHtml + seo) in 13 batches, 0 userErrors; read-back confirmed.
- Before values: changes/2026-10-16-shopify-agentic-before.json; change record: changes/2026-10-16-shopify-agentic.csv.
- Removed after review: "lab tested", "GMP certified facility" lines (5 products); Castor roll-on named per Amazon ("Castor oil eye roller").
- Amazon fixes approved same day (claims off 72PC/48PC, GK0220-Gold 36 pcs, 54PC 54 pcs, eucalyptus botanical name):
  amazon_fixes.py, changes/2026-10-16-amazon-fixes-send.csv (54 fields, read back OK).
Next (not done): theme-level Product/FAQ JSON-LD, category metafields, llms.txt - theme writes blocked for connector on live theme.
