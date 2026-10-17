# Shopify agentic product content: spec (BodyJ4You, 2026-10-16)

Shopify (bodyj4you.com) is BodyJ4You's agentic channel. Shopify Agentic syndicates the catalog to ChatGPT, Google AI Mode/Gemini,
Meta AI, Microsoft Copilot and Shop. Write every product page for AI agents that read, extract and compare products in order to answer
a shopper's question. Agents reward: an answer-first entity definition, explicit facts as label/value pairs, exact numbers and units,
clear variant differences, what's in the box, use cases phrased the way shoppers ask, and short Q&A pairs that can be quoted on their own.
Agents ignore fluff, superlatives and repetition.

## Source of facts (strict)
- Use ONLY facts in the product's pack file (`packs/<group>__<id>.txt`): Amazon bullets, titles, highlights and attributes for each
  variant SKU, plus the Shopify variant list. The Amazon bullets hold the key facts.
- Never invent numbers, sizes, materials, certifications, origins, counts or compatibility. If the pack doesn't say it, leave it out.
- If variants differ (colors, styles, sizes, pack counts), describe each difference accurately. If the pack shows a conflict between
  variants or between the Shopify title and the Amazon facts, write it up in `flags` and don't guess.

## Compliance (hard rules)
- **No medical or drug claims**, especially for aftercare and oils. Never write heal, healing, cure, treat, treatment, prevent infection,
  antibacterial, antiseptic, antimicrobial, disinfect, kills germs, reduce swelling/redness/pain, keloid removal or treatment, scar removal,
  hair growth or regrowth, relieves, anxiety, insomnia, therapeutic, clinically proven, or doctor/dermatologist recommended. Use cosmetic
  and routine language instead: cleanse, rinse, condition, moisturize, soften, "dry-feeling skin", "part of a simple low-touch routine",
  "for external use only". Pre-diluted essential oils and the Focus/Sleep/Stress blends: describe scent, format and how to apply, never an
  effect on health, mood or sleep. "Bump" products: describe them as care oil for the skin around a piercing, not as removing bumps.
- **No kids, girls, boys, teens, tweens, children, school or age wording** anywhere, including FAQ and use cases. If a variant name
  contains such a word (e.g. "Back to School Mix"), don't repeat the name; refer to it generically.
- No superlatives or rank claims (best, #1, top-rated), no competitor or other brand names, no "Made in USA", no money-back or guarantee
  promises, no prices, no "Amazon" mentions. English only.
- Keep claims Amazon already makes about materials (surgical stainless steel 316L, USDA Organic, hexane free, cold pressed, non-toxic
  plastic, hypoallergenic, nickel free) only if they appear in the pack for that product.

## Structure of `descriptionHtml` (simple HTML: p, h2, h3, ul, li, strong only; no inline styles, no tables, no emojis)
1. `<p>` **Answer-first definition**, 1-2 sentences: "The BodyJ4You <name> is a <what it is> that <core job>, with <the 2-3 most decisive facts>."
2. `<h2>Key Facts</h2>` then a `<ul>` of `<li><strong>Label:</strong> value</li>`, 6-12 items. Typical labels: Product type, Brand
   (BodyJ4You), Pieces/Count, Sizes/Gauges, Material, Volume, Format, Closure/Fit, Colors/Styles available, Pack sizes, Use.
3. `<h2>What's Included</h2>` a `<ul>` listing exactly what ships, with counts and sizes where the pack gives them.
4. `<h2>Variants</h2>` (only when there are 2+ variants): one `<li>` per option value, stating what's different about it.
5. `<h2>Features</h2>` a `<ul>` of 4-7 factual feature statements taken from the bullets, one idea per item, no marketing filler.
6. `<h2>How to Use</h2>` steps or a short paragraph, only if the pack gives usage directions.
7. `<h2>Use Cases</h2>` a `<ul>` of use cases and occasions phrased as shoppers search ("beginner ear stretching from 14G", "90s or Y2K
   outfits", "Halloween costume accessory").
8. `<h2>Care and Safety</h2>` short, factual (waterproof, cleaning, external use only, patch test), only from the pack.
9. `<h2>Frequently Asked Questions</h2>` then 5-8 pairs as `<h3>Question?</h3><p>Answer.</p>`. Ask what shoppers ask an AI
   assistant before buying: sizes and fit, what's included, material and skin sensitivity, water use, which variant to choose, how to use,
   how it compares within the BodyJ4You range. Each answer is 1-3 sentences, self-contained (repeat the product name), and factual.

Length: about 300-550 words. Don't repeat the same keyword phrase more than twice. Write plainly.

## SEO fields
- `seoTitle`: up to 60 characters, ends with " | BodyJ4You", leads with the product's main noun phrase and the key spec.
- `seoDescription`: up to 155 characters, one factual sentence with the decisive facts.

## Output
Write `out/<group>.json`: an object keyed by the Shopify product id (the numeric id from the pack header) with
`{"descriptionHtml": "...", "seoTitle": "...", "seoDescription": "...", "flags": ["..."]}` (flags may be empty). It must be valid
JSON (json.load it to check). Then run the checker: `python3 check.py out/<group>.json` and fix every problem it reports.
