# BodyJ4You Amazon Ads Playbook (v0.3, draft for review)

This is the rulebook the audit and the automation follow. Every rule has a
source tag:

- **[T]** Trivium / Mina Elias, from the four articles Denis specified plus
  six more Trivium posts (see Sources). Numbers are quoted as published.
- **[A]** Amazon Ads documentation or platform constraint.
- **[D]** Our own default where the source gives a principle but no number.
  Denis confirms or overrides these. Every [D] number lives in
  `ads/config.json` and changes without touching code.

v0.3 adds Denis's two decisions: waste and pause are actioned in either
phase, and the zero-sale benchmark scales with each product's price and CVR.

v0.2 replaced the v0.1 draft after reading the four articles directly. What
changed: portfolios are per parent, not per category; branded keywords get
their own campaigns; each product sits in one optimization phase at a time;
zero-impression targets get a bid raise before removal; the honeymoon rule
for launches. Nothing in v0.1 was contradicted.

---

## 1. Goals and the numbers that drive everything

**Three goals of a PPC strategy.** [T] Generate sales, improve organic rank
by driving sales velocity on relevant top-of-search keywords, and generate
data: discover new profitable search terms for campaigns and for the listing.

**Break-even ACoS = profit margin before ad spend.** [T] Ad spend above that
share of ad sales loses money on the sale.

**Target ACoS = break-even ACoS minus the profit you want to keep.** [T]
Example: 45% margin, want 20% net, target ACoS 25%.

**TACoS is the account scoreboard, ACoS is the campaign dial.** [T] TACoS
trending down while total sales grow means ads are lifting organic. We
report TACoS at account, category and parent, ACoS at campaign and below,
matching the Monday brief.

**Per-parent targets live in `ads/config.json`.** [D] Each parent gets
`stage`, `break_even_acos`, `target_acos`, `price`, `asins`. Margins come from
Helium 10 COGS or Sellerboard, not guessed. Until filled, the audit uses the
account defaults.

Stage defaults [D], replaced per parent once margins are in:

| Stage   | Goal                                  | Phase (section 4) | Target ACoS vs break-even |
|---------|---------------------------------------|-------------------|---------------------------|
| launch  | honeymoon velocity, reviews, rank     | performance       | at or above break-even    |
| grow    | scale sales at controlled ACoS        | performance       | break-even minus 5 to 10  |
| harvest | protect margin, defend rank           | profitability     | break-even minus 15+      |

**Honeymoon.** [T] Roughly the first couple of weeks after launch Amazon
weights performance more heavily. Aim for 5 to 10 sales per day in that
window, using coupons for the green badge if needed. Launch-stage parents
are therefore in performance mode regardless of ACoS.

---

## 2. Account structure

**One portfolio per parent product.** [T] Stated in both the audit and the
weekly articles. Every campaign for a parent sits in that parent's
portfolio, so product-level performance reads straight off the portfolio.
v0.1 said per category; that was wrong.

**Consistent naming.** [T] Trivium: no right or wrong scheme, as long as it
is consistent and reflects each element of the campaign. Ours [D]:

```
SP | <ParentCode> | <AUTO-CLOSE|AUTO-SUB|AUTO-LOOSE|AUTO-COMP|B|P|E|PT|CAT|BRAND> | <descriptor>
SB | <ParentCode> | <KW|PT|VIDEO> | <descriptor>
SD | <ParentCode> | <AUD|PT> | <descriptor>
```

Legacy campaigns keep their names until restructured; the audit maps them
to parents by advertised ASIN.

**One campaign, one ad group.** [T] 100% of the budget goes to that ad
group. With several ad groups Amazon splits the budget unevenly.

**One match type per campaign, auto and manual alike.** [T] Mixed match
types get uneven budget. Separating lets you scale at budget and bid level.

**Five keywords or product targets per ad group, maximum.** [T] Trivium's
data: an ad group with 15 to 20 keywords has the top 5 generating 80 to
100% of sales. Keyword dumping starves the rest.

**Segregate by search volume and performance.** [T] High-volume keywords
starve low-volume ones of impressions. Group like with like.

**Branded keywords in their own campaigns.** [T] Higher purchase intent,
different performance, different optimization. Never mixed with generic
terms. Brand term list is in `config.json` (`brand_terms`).

**Top keywords get single-keyword campaigns.** [T] First ten main keywords:
one campaign each for broad, phrase, exact. After that, about three per
campaign, long tail up to five. Single-keyword campaigns also lift organic
rank on that term and its relatives (SEO article).

**Auto campaigns split by targeting group.** [T] Start with close match and
substitutes. Loose match and complements in their own campaigns if run.

**Test every campaign and match type.** [T] Trivium's note in the weekly
article: the structure above is the control layer, but you still run auto,
broad and phrase as discovery so there is something to harvest.

**One product (parent or true variation family) per campaign.** [T]

**Budgets must meet traffic demand.** [T] Exhausting a daily budget is a
missed sale. A profitable campaign with good ROAS that caps out gets its
budget raised. Our rule [D]: capped at 90% usage and ROAS above the scale
threshold, raise 25%. Capped with poor ROAS, lower bids first.

---

## 3. Bidding

**Starting bid.** [T, widely taught by Mina Elias]

```
max_bid = price × conversion_rate × target_ACoS
```

No history: parent average order value, parent CVR from Business Reports or
SQP, parent target ACoS. With history: the target's own CVR once it has at
least 20 clicks [D].

**Small increments, e.g. $0.05.** [T] Quoted in the audit article. The bids
article adds $0.03, $0.05, $0.10 up and $0.03, $0.05, $0.07 down. Move a few
positions, not a page.

**Low ACoS → raise the bid for more visibility.** [T] Our trigger [D]: ROAS
above 3 and at least 2 orders in the window.

**High ACoS → lower the bid.** [T] Trivium's published filters: spend above
$10 with zero sales, ACoS above 80%, ROAS below 1.5.

**Zero sales is judged against the product, not a flat $10.** [D, Denis
2026-10-06] A $10 flat line is too trigger-happy on a $25 product and too
lenient on a $10 one. A zero-order target is wasteful when both hold:

```
clicks ≥ ln(1 − confidence) / ln(1 − parent_CVR)      # the silence is unlikely
spend  ≥ lost_orders × price × target_ACoS            # you have paid for N orders and got none
```

Defaults: 90% confidence and 2 lost orders for negation, 95% confidence for
pausing a target. Example, rosehip 4oz at $9.99, target ACoS 25%, parent CVR
8%: negate after 28 clicks and $5.00 with no order. The 16oz at $24.99 with
CVR 6%: 37 clicks and $12.50. Trivium's $10 remains the fallback when a
parent has no price or CVR on file.

**Low or zero impressions → raise the bid first, a second chance.** [T]
Only remove after the raise has had a window to work.

**Pause instead of lowering again** [D]: zero orders past the 95% benchmark
above in 60 days. Fallback 30 clicks when the parent has no CVR.

**Dynamic bidding.** [D] Down only on manual campaigns; placement modifiers
carry the upside. Flag up-and-down campaigns for review.

**Placement modifiers.** [T] No adjustment set: check whether the campaign
converts better at top of search or product pages and set one. Adjustment
set: scale placements with high ROAS, cut placements with high wasted spend.
Thresholds [D]: a placement earns +25% when its ROAS is at least 1.3× the
rest on at least 10 orders. A modifier is cut to 0 when its placement ROAS
drops below 1.

---

## 4. Weekly optimization routine

**Two phases, one at a time, per product.** [T] This is the organizing idea
of Trivium's weekly article. It is not profitable to stay in one phase
forever, and it is not effective to run both at once. Each parent is in one
phase; different parents can be in different phases.

**Performance phase** (launch and grow): raise bids and budgets to lift
sales velocity and organic rank, optimize bid by placement for conversions,
launch new campaigns for traffic.

**Profitability phase** (harvest, or high ACoS and high spend): lower bids
on non-profitable targets, reduce poor placement adjustments, eliminate
irrelevant and non-profitable search terms.

The audit tags every finding with its phase. Findings outside the parent's
current phase are listed as deferred, not dropped. Parents with no stage on
file get both lists in full.

**Exception [D, Denis 2026-10-06]:** removing something that spends money
with no sales is done in either phase. Negating zero-order search terms and
pausing zero-order targets are never deferred. Trivium places negation in
profitability mode; we keep that for high-ACoS bid cuts (bleed), not for
pure waste.

**Monitoring in performance phase.** [T] Spend growth should be proportional
to session growth, otherwise the keywords are not relevant. The gap between
PPC sales and total sales should widen: that is organic growth. CTR and CVR
may dip from extra traffic; a large change gets investigated.

**Monitoring in profitability phase.** [T] Spend falls with minimal impact
on sessions. Total sales hold steady, which means rank is holding. Profit
rises.

**Weekly steps, in order:**

1. **Search term report, Sponsored Products, summary, last 30 days.** [T]
2. **Negation.** [T] Filter 1: spend above $10 and zero sales. Filter 2: high
   ACoS. Also anything plainly irrelevant, which besides costing money hurts
   how the algorithm reads the listing. Keyword search terms become negative
   exact; ASINs become negative product targets. Applies to auto, broad,
   phrase and expanded ASIN campaigns, not exact.
3. **Harvest.** [T] Profitable search terms discovered in auto, broad or
   phrase launch in new campaigns of their own, per the structure rules, and
   are negated in the source so the data stays clean. Threshold [D]: 2
   orders in 30 days, or 1 order under target ACoS.
4. **Bids.** Per section 3, including the second-chance raise on zero
   impression targets.
5. **Budgets.** [T] Raise where capped and profitable.
6. **Placements.** Per section 3.
7. **Phase check.** Read the monitoring metrics above for each parent and
   decide whether it stays in its phase.

Lookbacks [D]: 30 days for negation and harvest, 60 for bids, 90 for
structure and pause. The last 3 days are dropped for attribution lag.

---

## 5. Audit checklist (what `audit.py` scores)

Trivium audits at least yearly and after any significant change [T]. We run
the structural part on every snapshot and the performance part weekly.

| Check          | Rule                                                               | Phase         | Source |
|----------------|--------------------------------------------------------------------|---------------|--------|
| portfolio      | campaign not in a portfolio, or portfolio holds several parents    | structural    | T      |
| structure      | campaign has more than 1 ad group                                  | structural    | T      |
| structure      | ad group has more than 5 targets                                   | structural    | T      |
| structure      | ad group mixes match types, or keywords with product targets       | structural    | T      |
| structure      | ad group advertises more than one parent                           | structural    | T      |
| branded        | branded and generic keywords in the same campaign                  | structural    | T      |
| overlap        | same keyword and match type enabled in two or more campaigns       | structural    | T      |
| bidding        | campaign uses dynamic up and down                                  | structural    | D      |
| waste          | 0 orders past the 90% click/spend benchmark, not negated           | always        | T/D    |
| bleed          | target spend ≥ $10 and ACoS > 80% or ROAS < 1.5                    | profitability | T      |
| pause          | 0 orders past the 95% click/spend benchmark in 60 days             | always        | D      |
| placement cut  | modifier set, placement ROAS < 1                                   | profitability | T      |
| never-negated  | discovery campaign with spend ≥ $50 and zero negatives             | profitability | D      |
| scale          | target ROAS > 3 with ≥ 2 orders                                    | performance   | T      |
| harvest        | converting discovery search term with no exact anywhere            | performance   | T      |
| budget raise   | ≥ 90% budget usage and ROAS ≥ 3                                    | performance   | T      |
| budget hold    | ≥ 90% budget usage and ROAS < 1.5 → lower bids first               | profitability | T      |
| placement set  | placement ROAS ≥ 1.3× rest, ≥ 10 orders, no modifier               | performance   | T      |
| zombie         | enabled target with < 100 impressions in 90 days → raise bid       | performance   | T      |
| coverage       | parent with SP sales; confirm SB and SD exist                      | info          | D      |

**Listing diagnostics from ad metrics.** [T] High CTR with low CVR means
the detail page is not convincing. Low CTR with high CVR means the listing
is not getting attention: main image, title, price, rating. The audit reports
CTR and CVR per parent so these two cases can be handed to the
listing-optimizer and main-image skills.

Findings are ranked by dollars: wasted spend first, then under-scaled
revenue, then structure.

---

## 6. SEO and PPC together

**Rank is relevance plus performance.** [T] Relevance: title, backend
keywords, brand field, bullets and description. Performance: price,
conversion rate, images, reviews, sales history.

**PPC moves organic rank.** [T] What Trivium sees work: single-keyword
campaigns, which lift organic rank on that keyword and over time on related
ones, and video ads, tested across styles and orientations.

**CTR and CVR feed each other and feed rank.** [T] Both are ranking signals.
Conversion rate also decides how Amazon treats the ads, since the algorithm
favors the highest-converting ad as the most relevant. Listing work is PPC
work.

**Harvest into the listing.** [T] Profitable discovered search terms go into
title, bullets and backend. The listing-optimizer skill does the writing;
the audit's harvest list is its input.

**Backend keywords.** [T] Synonyms and alternative spellings, common
misspellings, long tail, spaces not commas, no competitor brand names, no
repetition of what is already in the title, reviewed regularly against
performance data.

**Honeymoon.** [T] As in section 1: 5 to 10 sales a day for the first couple
of weeks, coupons allowed.

**Keyword research sources.** [T] Amazon's own data, Helium 10, Jungle
Scout. For us: the Ads API search term report first (free), Helium 10 for
volume and rank only (quota).

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

Helium 10 quota on 2026-10-06: 276 of 1,000 left this month. Rule [D]:
Helium 10 is never called for anything the Ads API or SP-API can answer.
Research calls are batched, cached under `ads/data/h10/`, and capped per
month in `config.json` (`h10_monthly_cap`, default 100).

---

## Sources

The four articles Denis specified (read in full on 2026-10-06):

- https://triviumco.com/blog/demystifying-amazon-ppc-a-comprehensive-guide/
- https://triviumco.com/blog/amazon-ads-audit/
- https://triviumco.com/blog/mastering-amazon-ppc-from-setup-to-success-with-weekly-optimization/
- https://triviumco.com/blog/amazon-seo/

Further Trivium posts used for numbers (via search summaries):

- https://triviumco.com/blog/how-to-structure-your-amazon-ppc-campaigns-for-success/
- https://triviumco.com/blog/optimizing-your-amazon-ppc-bids-for-maximum-roi/
- https://triviumco.com/blog/how-to-effectively-manage-your-amazon-ppc/
- https://triviumco.com/blog/a-guide-to-self-auditing-your-amazon-account-optimizing-for-performance-profitability/
- https://triviumco.com/blog/amazon-acos/
- https://triviumco.com/blog/amazon-ppc-strategies/
