# BodyJ4You Amazon Ads Playbook (v0.1, draft for review)

This is the rulebook the audit and the automation follow. Every rule has a
source tag:

- **[T]** Trivium / Mina Elias public material (see Sources). Numbers are quoted
  as published.
- **[A]** Amazon Ads documentation or platform constraint.
- **[D]** Our own default where the source gives a principle but no number.
  Denis confirms or overrides these. Everything in `ads/config.json` is a [D]
  value and can be changed without touching code.

Four Trivium articles Denis pointed to are blocked by the cloud environment's
network policy (`triviumco.com`). Rules that those articles may sharpen are
marked **[T?]**. Once the domain is allowed, or the articles are dropped into
Drive, this file gets a v0.2 pass.

---

## 1. Goals and the numbers that drive everything

**Break-even ACoS = profit margin before ad spend.** [T] If ad spend as a
share of ad sales exceeds the margin, the sale loses money.

**Target ACoS = break-even ACoS minus the profit you want to keep.** [T]
Example: 45% margin, want 20% net, target ACoS 25%.

**TACoS is the account scoreboard, ACoS is the campaign dial.** [T] TACoS
trending down while total sales grow means ads are lifting organic. TACoS
flat or rising with flat sales means we are buying sales we would have had.
We report TACoS at account, category and parent level, ACoS at campaign and
below. This matches the existing Monday brief conventions.

**Per-parent targets live in `ads/config.json`.** [D] Each parent SKU gets:
`stage` (launch, grow, harvest), `break_even_acos`, `target_acos`. Margins
come from Helium 10 COGS or Sellerboard, not guessed. Until Denis fills
them, the audit uses the account default in the config.

Stage defaults [D], to be replaced per parent:

| Stage   | Goal                                   | Target ACoS vs break-even |
|---------|----------------------------------------|---------------------------|
| launch  | rank and reviews, accept losses        | at or above break-even    |
| grow    | scale sales at controlled ACoS         | break-even minus 5 to 10  |
| harvest | protect margin, defend rank            | break-even minus 15+      |

Trivium's lifecycle article is in the blocked set; this table is [T?].

---

## 2. Account structure

**One campaign, one ad group, five targets or fewer.** [T] Quoted repeatedly
by Trivium. Rationale: budget and bid control per keyword group, clean data.

**One match type per campaign.** [T] Never mix broad, phrase, exact in one ad
group. Never mix keyword targets and product targets in one ad group.

**Top keywords get single-keyword campaigns.** [T] For the first ten main
keywords of a product: one campaign each for broad, phrase and exact. After
that, roughly three keywords per campaign, then long tail up to five per
campaign. Never more than five.

**Split high-volume from low-volume keywords.** [T] A high-volume keyword in
the same ad group starves the others of impressions.

**Auto campaigns are split by targeting group.** [T] Start with two: close
match and substitutes. Loose match and complements go in their own campaigns
if run at all, since they convert worse. Each auto group gets its own bid.

**One product (parent or tight variation family) per campaign.** [T] Group
only true variations together. Different products never share an ad group.

**Naming convention.** [D] So the audit and automation can parse intent:

```
SP | <ParentCode> | <AUTO-CLOSE|AUTO-SUB|AUTO-LOOSE|AUTO-COMP|B|P|E|PT|CAT> | <descriptor>
SB | <ParentCode> | <KW|PT|VIDEO> | <descriptor>
SD | <ParentCode> | <AUD|PT> | <descriptor>
```

Example: `SP | PA-SALINE | E | piercing aftercare spray`. Legacy campaigns
keep their names until restructured; the audit maps them by advertised ASIN.

**Portfolios per category** [D]: PA, EO, NC, GK, PJ, FJ, matching the brief.

**Budgets must not cap good campaigns.** [T] Trivium quotes at least $100
daily per campaign for their accounts [T]. That is their client profile, not
ours. Our rule [D]: a campaign with ROAS above the scale threshold that hits
budget before end of day is under-budgeted and gets raised. A campaign that
hits budget with poor ROAS gets bids lowered first, not budget raised.

---

## 3. Bidding

**Starting bid formula.** [T] Widely taught in Mina Elias's material:

```
max_bid = price × conversion_rate × target_ACoS
```

With no history, use the parent's average order value, the parent's
conversion rate from Business Reports or SQP, and the target ACoS. With
history, use the target's own CVR once it has at least 20 clicks [D].

**Move bids in small steps.** [T] Increase by $0.03, $0.05 or $0.10.
Decrease by $0.03, $0.05 or $0.07. The aim is to move a few positions, not
from page one to page three.

**Raise bids when:** [T] ROAS above 3 (or 4 for stricter accounts). Our
default `scale_roas` is 3 [D]. Also requires at least 2 orders in the window
so one lucky sale does not trigger a raise [D].

**Lower bids when:** [T] spend above $10 with zero sales, or ACoS above 80%,
or ROAS below 1.5. These are Trivium's published filters. Our config exposes
them as `waste_spend_min`, `bleed_acos`, `bleed_roas`.

**Pause rather than keep lowering** [D]: a target with at least 30 clicks and
zero orders over 60 days is paused, not bid down again.

**Dynamic bidding.** [T?] Trivium favors control. Default [D]: `down only`
for manual campaigns, placement modifiers used instead of `up and down`.
Flag any `up and down` campaign for review rather than auto-changing it.

**Placement modifiers.** [T] From the audit article: where a campaign has
no placement adjustment, check whether it converts better at top of search
or product pages and set one. Where it has one, scale placements with high
ROAS and cut placements with high wasted spend. Our thresholds [D]: a
placement earns a modifier when its ROAS is at least 1.3× the campaign's
other placements on at least 10 orders. A modifier is cut when that
placement's ROAS falls below 1.

---

## 4. Weekly optimization routine

Trivium's cadence is weekly, with two modes. [T]

**Performance mode** (launch and grow stages): raise bids and budgets on
winners to increase sales velocity.

**Profitability mode** (harvest stage, or when TACoS is above target): lower
bids on non-profitable targets and negate irrelevant search terms.

Weekly checks, in order:

1. **Search term report, last 30 days, summary.** [T] Trivium's exact
   report configuration: Sponsored Products, summary, summary time unit,
   last 30 days.
2. **Negation pass.** [T] Filter 1: spend above $10 and zero sales. Filter 2:
   high ACoS. Applies to auto, broad, phrase and expanded ASIN campaigns
   only. Not to exact, since exact is tuned by bid. Add as negative exact in
   the campaign where the term appeared.
3. **Harvest pass.** [T] Search terms that convert in auto, broad or phrase
   move to their own exact campaign (per the structure rules above) and are
   negated as negative exact in the source campaign so the data stays clean.
   Threshold [D]: at least 2 orders in 30 days, or 1 order with ACoS under
   target. The blocked "weekly optimization" article may give Trivium's own
   number [T?].
4. **Bid pass.** Raise and lower per section 3.
5. **Budget pass.** [T] Budgets must meet traffic demand. Check budget
   utilization; raise where capped and profitable.
6. **Placement pass.** Per section 3.
7. **Health checks.** [T] Spend growth should be proportional to session
   growth. Watch the gap between PPC sales and total sales as the organic
   signal. Total sales must stay steady to hold organic rank.

Lookback windows [D]: 30 days for negation and harvest, 60 days for bids,
90 days for structure and pause decisions. Attribution lag means the last
3 days are always understated; the automation excludes them.

---

## 5. Audit checklist (what `audit.py` scores)

From Trivium's audit guidance [T], with our numeric defaults [D]:

| Check            | Rule                                                              | Source |
|------------------|-------------------------------------------------------------------|--------|
| structure        | ad group has more than 5 targets                                  | T      |
| structure        | campaign has more than 1 ad group                                 | T      |
| structure        | ad group mixes match types, or keywords with product targets      | T      |
| structure        | ad group advertises more than one parent                          | T      |
| overlap          | same keyword and match type enabled in two or more campaigns      | T      |
| waste            | search term spend ≥ $10, 0 orders, not yet negated                | T      |
| bleed            | target spend ≥ $10 and ACoS > 80% or ROAS < 1.5                   | T      |
| scale            | target ROAS > 3 with ≥ 2 orders                                   | T      |
| harvest          | converting search term in auto/broad/phrase with no exact anywhere| T      |
| never-negated    | auto/broad/phrase campaign with spend ≥ $50 and zero negatives    | D      |
| budget           | campaign at ≥ 90% budget usage and ROAS ≥ 3 → raise               | T      |
| budget           | campaign at ≥ 90% budget usage and ROAS < 1.5 → lower bids        | T      |
| placement        | placement ROAS ≥ 1.3× rest, ≥ 10 orders, no modifier              | T/D    |
| placement        | modifier set, placement ROAS < 1                                  | T/D    |
| zombie           | enabled target with < 100 impressions in 90 days                  | D      |
| pause            | target ≥ 30 clicks, 0 orders in 60 days                           | D      |
| bidding          | campaign uses dynamic up-and-down                                 | T?     |
| coverage         | parent with sales but no Sponsored Brands or Display              | D      |

Findings are ranked by dollars: wasted spend first, then under-scaled
revenue, then structure.

---

## 6. SEO and PPC together

**PPC sales velocity lifts organic rank.** [T] Sales from ads count toward
the ranking signal on that search term.

**Harvest into the listing.** [T] Top converting ad search terms belong in
the title, bullets and backend. Trivium calls PPC data a goldmine for SEO.
The existing listing-optimizer skill does the writing; the audit produces
the list of terms to feed it.

**Keyword selection.** [T] Relevant terms with search volume and low
competition. Indexing is a precondition for ranking, so every harvested
term is checked for indexing before a ranking campaign is funded.

**Ranking campaigns** [T?]: exact match, top-of-search modifier, run until
organic rank on page one holds for two weeks, then step the bid down. The
blocked SEO article may give Trivium's own duration.

---

## 7. Data sources and budgets

| Need                                      | Source            | Cost        |
|-------------------------------------------|-------------------|-------------|
| campaigns, ad groups, targets, negatives  | Amazon Ads API    | free        |
| search term, targeting, placement reports | Amazon Ads API    | free        |
| budget utilization                        | Amazon Ads API    | free        |
| catalog, parent mapping, prices           | SP-API, catalog   | free        |
| sales, sessions, CVR by ASIN              | SP-API reports    | free        |
| keyword search volume, rank history       | Helium 10         | quota       |
| competitor keyword gaps                   | Helium 10         | quota       |

Helium 10 quota as of 2026-10-06: 276 of 1,000 left this month. Rule [D]:
Helium 10 is never called for anything the Ads API or SP-API can answer.
Research calls are batched, cached in `ads/data/h10/`, and capped per month
in `ads/config.json` (`h10_monthly_cap`, default 100).

---

## Sources

Trivium articles reachable from this environment:

- https://triviumco.com/blog/how-to-structure-your-amazon-ppc-campaigns-for-success/
- https://triviumco.com/blog/optimizing-your-amazon-ppc-bids-for-maximum-roi/
- https://triviumco.com/blog/how-to-effectively-manage-your-amazon-ppc/
- https://triviumco.com/blog/a-guide-to-self-auditing-your-amazon-account-optimizing-for-performance-profitability/
- https://triviumco.com/blog/amazon-acos/
- https://triviumco.com/blog/amazon-ppc-strategies/

Articles Denis asked for, blocked by network policy, pending v0.2:

- https://triviumco.com/blog/demystifying-amazon-ppc-a-comprehensive-guide/
- https://triviumco.com/blog/amazon-ads-audit/
- https://triviumco.com/blog/mastering-amazon-ppc-from-setup-to-success-with-weekly-optimization/
- https://triviumco.com/blog/amazon-seo/
