# eCom Hill — Build Handoff & Messaging

**What eCom Hill is:** an **expert-for-hire agency** for Amazon & Walmart sellers. Hire experts
by the hour, or retain a month. That pricing model is correct and stays.

**Tone:** lead **serious and competent**. Personality (the dogs, the calm voice) shows through
as **proof of expertise — not branding theater**. The wit earns its place by sitting next to
real, hard work; it never leads.

**Design:** **no redesign.** Clean, readable, professional — good bones. No color changes, no UI
overhaul. This handoff is content, information architecture, and making things actually work.

---

## Page order (information architecture)

New top-to-bottom order:

1. **Hero**
2. **Services** — reordered to **lead with the serious work** (see below)
3. **Error-code "dog" cards** — *moved down*, to here (after Services, before Compliance). Keep
   them — they're the best visual asset; they just shouldn't lead.
4. **Compliance** — *new section* (see copy below), placed **before AI**
5. **AI Implementation** (coming soon)
6. **Why small is the point**
7. **Pricing** (expert-for-hire — unchanged)
8. **About** (Denis + Neo)
9. **Contact**
10. **Footer**

> Plus: **sticky top nav** (see Functional fixes) so visitors can jump between these without
> scrolling back up.

---

## 1. Services — reorder to lead with serious work

Reorder the Services list so the **heavyweight, account-saving work comes first**. This signals
serious capability before the catalog housekeeping.

**Lead with, in this order:**
1. **Account Health Violations** — appeals and corrective action plans that get accepted.
2. **Compliance Issues** — the documentation/policy work that keeps the account open.
3. …then the rest of the catalog fixes (suppressions, brand, GTIN, parentage, SEO, nodes).

Each item stays **error-message-led** — the literal Amazon string the seller searches (verified
list below). Drop the `HIGH / MEDIUM / LOW` severity pills; the error code *is* the label.

### Verified Amazon error strings (the search terms) → live outcome

| The error the seller sees / searches (State 1) | Live on Amazon (State 2) |
|---|---|
| **"Account Health Rating: At Risk — your account is at risk of deactivation"** | Violations appealed; rating back to Healthy. |
| **"A GTIN exemption is required to list without a barcode"** | Exemption granted; list without UPC/GTIN. |
| **Error 5665** — "You are trying to add a product under a brand that is not recognized by Amazon" | Brand approved; listing live on every ASIN. |
| **Error 5461** — "You may not create new ASINs for the brand [X]" | Catalog authorization granted; new ASIN created and live. |
| **Error 8541** — "your Product ID (UPC/EAN) matches an existing ASIN / your data doesn't match Amazon's catalog" | Conflict resolved; the correct detail page goes live. |
| **Error 8572** — "You are using UPCs, EANs, ISBNs, ASINs, or JAN codes that do not match the products you are trying to list" | GS1/UPC authorized; listing live under your barcode. |
| **Error 8560** — "[inventory template] invalid values, missing fields, or product IDs that don't match any ASIN" | Flat file debugged; the feed uploads clean. |
| **Error 90057** — "The variation-theme field contains an invalid value" | Variation family built; sizes/colors live together. |
| **Error 8008** — "the parent SKU for your variation can't be found" | Parent-child re-attached; variations consolidate. |
| **"This listing is currently suppressed" / Search Suppressed** | Suppression cleared; ASIN back in search results. |
| **"Your offer is not eligible for advertising" / Ineligible** | PPC eligibility restored; ads run again. |

> Confirm exact wording against a live error in your own Seller Central before publishing —
> Amazon tweaks copy and some strings are category-specific. Where Amazon has no clean coded
> message, lead with the plain problem instead of inventing a code.

---

## 2. Error-code "dog" cards — KEEP, move down

The named pack (Captain Biscuit · 5665, Luna Pickles · 8541, Mr. Waffles · 5461, Daisy Rocket ·
account health) stays — it's the best visual asset. Just **relocate it below Services and above
Compliance**, so the serious work leads and the personality lands as proof, not as the opener.

---

## 3. NEW — Compliance section (place before AI)

Real revenue work, framed seriously. Draft copy:

> **COMPLIANCE**
> ## The unglamorous work that keeps you legal.
> Not the flashy stuff — the documentation and policy work that keeps your account open and your
> products listable. Most agencies skip it. It's exactly where suspensions start.
>
> - **Account health audits** — a full review of violations, defects, and policy flags, with a
>   plan to clear them before they cost you the account.
> - **Policy violation resolution** — appeals and corrective action plans written to actually
>   get accepted, not auto-rejected.
> - **GTIN exemptions** — approval to list without barcodes, secured or repaired.
> - **SDS & safety documentation** — Safety Data Sheets and compliance docs prepared and filed
>   for restricted and hazmat products.
> - **Manufacturer & marketing claims** — product and marketing claims reviewed and
>   substantiated so your listings don't trip a compliance flag.
>
> *The work nobody advertises, because it isn't glamorous. It's also the work that keeps you
> selling.*

---

## 4. Pricing — KEEP as-is (expert-for-hire)

Hourly by role ($140 / $110 / $80) + monthly tiers stay. Saying plainly it costs money — per
hour, or retain a month — is the honest sell.

---

## Functional fixes (need the live site source / platform access)

These are implementation/dev tasks. They require the site's codebase or CMS (Webflow / Framer /
WordPress / etc.). Spec for each:

- **Footer social links — fix dead links.** LinkedIn and X/Twitter currently point nowhere
  (placeholder/`#`). Either set the real profile URLs, or remove the items entirely. Don't ship
  dead links.
- **Contact form — make it actually submit.** Today it appears to open an email client
  (`mailto:`) rather than submit. Wire it to a real form handler (platform-native form, or
  Formspree/Netlify/Web3Forms), deliver to **denis@ecomhill.com**, and add visible success and
  error states. **Test a real submission on mobile** (and confirm the "What are we fixing?"
  dropdown and required-field validation work on a phone).
- **Sticky top navigation.** Make the header stick on scroll so **Menu** and **"Open a case"**
  stay reachable from anywhere on the page. Confirm the mobile menu opens/closes correctly and
  decide whether the "Account health: Healthy" bar sticks or scrolls away (recommend: let the
  thin bar scroll away, keep the logo + Menu sticky).

> I can implement all three directly if you point me to the repo or platform — otherwise these
> are ready for whoever owns the site build.

---

## Keep (no change)

Hero headline, proof bar, "Why small is the point," sniff-test audit, AI Implementation (coming
soon), About (Denis + Neo, "built by operators, not account managers"), and the footer line
"Not affiliated with Amazon or Walmart — the dogs are ours."

---

## Status

- **Ready now (content/IA/copy):** page reorder, Services lead-with-serious-work, error-string
  table, moving the dog cards, the new Compliance section copy, tone direction.
- **Needs site source/platform access (dev):** footer links, contact-form submission + mobile
  test, sticky nav.
