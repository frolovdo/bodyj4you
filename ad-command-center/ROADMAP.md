# Action Center roadmap (records)

Decided 2026-10-19 after comparing the tool with AdLabs' feature list. Kept here as a record; the site only shows the
Audiences plan (src/Audiences.jsx). Edit this file to change the roadmap.

## Word-pattern waste (n-grams)
- Status: Built
- Where: Search terms page
- Cuts every search into word patterns and adds up clicks and spend per pattern, so waste hidden across many small searches can be judged and blocked as a negative phrase. Same bad-luck rule as the Keywords page.

## Brand leak check
- Status: Built
- Where: Search terms page
- Brand searches paid for by generic campaigns. Today it is small, and there is no product-ad brand campaign to catch them, so the page says to leave them running.

## Product-ad brand campaign
- Status: Next
- Where: Update campaigns
- Found by the brand leak check: brand searches only have the banner to land on. A small exact-match product-ad campaign on our brand terms would make them cheap and let the generic campaigns block them.

## Second family under management
- Status: Next
- Where: Engine: /ads-discover then /ads-review
- Only rosehip is managed. The discovery and weekly review flow is family-agnostic; onboarding a second family is where most of the remaining money is.

## One rulebook
- Status: Planned
- Where: Engine weekly review
- Waste and bid rules exist twice with different thresholds (ads/audit.py in the public repo, review.py in the engine). Make the weekly review the single source and retire the duplicates before they drift further.

## Harvest routing rules
- Status: Planned
- Where: Keywords page
- Rules that say which campaign a harvested search term goes to (by size, job, or keyword type), instead of picking a destination by hand each time.

## Keyword ideas from Amazon
- Status: Built
- Where: Keywords page, and engine discovery
- Amazon’s ranked keyword recommendations for our ASINs, labelled against what we already run, buy through or block, with competitor brands marked. Add them as exact keywords from the Keywords page. In discovery, run ac_kwideas.py before spending Helium 10 calls.

## AMC queries on a schedule
- Status: Planned
- Where: Engine
- The 19 saved rosehip AMC queries run by hand today. Run the useful ones weekly and push the results, starting with the audience sizing query below.

## Tags on campaigns, targets and terms
- Status: Later
- Naming and families cover most of it today.

## Flow-canvas automation and widget dashboards
- Status: Decided not to build
- The scheduled jobs plus the approval queue already do the automation, and a dashboard builder is product work with little payoff for one account.

## AMC audiences as bid boosts
- Status: Next (sized 2026-10-19)
- Where: Audiences page (src/Audiences.jsx), sizing in sp-api/intel/AMC/rosehip/audiences/

# Meeting of 2026-10-29 (Koby, Zal): the fifteen asks

Recorded 2026-10-29. Status after the same-day pass; building the rest starts after Halloween, in the order under "Build order".

## 1. Reporting windows (1, 3, 7, 30 days, day over day)
- Status: Partly. Update cards show now vs 30 and 90 days for the five numbers and 7/30 days per campaign; keywords and SKUs show 30 days only.
- Build: 1/3/7/30-day columns and day-over-day per campaign, keyword and SKU, shown next to each proposed action (no separate reporting tab).

## 2. Every campaign type
- Status: Sponsored Brands built 2026-10-27 (JO - BANNER and 13 others are in every page). Sponsored Display: 3 enabled campaigns on the account; one belongs to a managed family (PB-2-DISPLAY -VIDEO-, PB), the other two (HB0019-VIDEO, GK0184) are in families the tool does not manage.
- Build: read Sponsored Display into Hourly and Update (reading only, like banners). Portfolio grouping: every campaign carries a portfolioId, so group by portfolio then SKU on the Whole account page.

## 3. Freshness and labels
- Status: Built. Daily pulls are shared account-wide since 2026-10-26 (one day a day). "Today so far" is real hourly data from Amazon Marketing Stream and now says so. The Top 3 page names its sources (Brand Analytics for the top 3, Search Query Performance for us).
- Rule: the ads console (reports and Marketing Stream) is the truth for what we paid for; Brand Analytics is share of all clicks on a search, so the two are never shown as the same number.

## 4. Placement split per keyword
- Status: Not possible per keyword: Amazon reports placement (top of search, rest of search, product pages) per campaign only. Exact per keyword only in one-keyword campaigns, which the KWORD campaigns nearly are.
- Build: per campaign, spend, clicks, CVR and ad cost by placement plus top-of-search impression share on the Update card, and a "product-page leak" flag on keyword campaigns (HS0002: about 1,000 product-page clicks in 30 days).

## 5. Low base + high top-of-search
- Status: Built 2026-10-29. Each Update card shows the effective top-of-search bid (base × (1 + modifier)) for the campaign's typical base and per keyword; type the wanted top-of-search bid and the modifier is set.

## 6. Dayparting
- Status: Sponsored Products built (Hourly page, hourly job). Out-of-budget time is shown for today and yesterday on the dashboard; the per-day history exists in the engine.
- Build: a 14-day out-of-budget strip per campaign; scheduled Sponsored Brands keyword-bid changes through the API (banners have no placement modifiers); hourly orders next to hourly spend so the separate hourly app is not needed.

## 7. Amazon's own budget rules
- Status: Readable (Ads API /sp/budgetRules and /sb/budgetRules, checked 2026-10-29: for example "jojoba top", +50% budget at ROAS 3 or better, active since 2026-10-15).
- Build: an "Amazon rule active" pill on the campaign card, and no budget suggestions from the tool on those campaigns.

## 8. Keyword goal dashboard
- Status: Partly. The Top 3 page (built 2026-10-27) has weekly searches, the top 3's click and purchase share, ours, the gap and the orders a day to close it, eight weeks back.
- Build: add cost per click and CVR by placement (from 4), the implied daily budget, and the organic position from the rank tracker. Top 3 targets are computed here, not from Helium 10 CPR.

## 9. Organic vs paid, with stop rules
- Build: per SKU, organic orders = business-report units minus ad orders, with TACoS; per keyword, Search Query Performance purchases minus ad search-term orders. Thresholds and review dates live in the test log (10).

## 10. Test log
- Status: Started 2026-10-29 as notes: sp-api/intel/HS0002/notes/TEST_LOG.md and sp-api/intel/EO-JOJOBA/notes/TEST_LOG.md (hypothesis, start settings, expected numbers, stop rule, result).
- Build: show the log on the History page and tie each block to the hypothesis pulse.

## 11. Overlap
- Build: on the Search terms page, per search term, every campaign bidding on it and the combined spend (the data is already pulled). Double-click rate is not in the API; not built.

## 12. Cross-size halo
- Build: advertised ASIN vs purchased ASIN from the purchased-product reports (Sponsored Products and Brands), per family, so 1 oz ads driving 4 oz and 16 oz sales is visible before changing what the banner advertises.

## 13. Profit layer
- Decided 2026-10-29: Sellerboard is the profit source. Today it is a manual export; the owner sets up a Sellerboard report by link (CSV URL, daily profit per SKU with fees, COGS and promotions) and puts the URL in the vault, then the engine pulls it daily. Deal days are flagged on every chart from the price history.

## 14. Organic rank report
- Status: Decision needed: where Koby's daily rank report is produced. The tool's own tracker covers the head term per family (Helium 10 notes file).

## 15. PIN
- The PIN said on the call is replaced by the owner: `python3 ~/sp-api/adsops/action_center.py resetpin NAME` prints a new one once, then `python3 ~/sp-api/adsops/ac_push_supabase.py config` pushes it online.

## Decisions taken (owner overrides by saying so)
1. The tool stays action-first; trend windows go next to each action, the Whole account page carries account-level windows. No separate reporting tab.
2. Source of truth for our clicks and spend: the ads console data. Brand Analytics only for share and competitors. Every number is labelled.
3. Dayparting: a schedule is approved once in the tool and then runs by itself, as the Sponsored Products hourly job does today; banners the same way.
4. Targets per SKU (position, organic share, review date) are set by the owner on Koby's proposal and stored in managed.json.

## North star (decided 2026-10-29)
- Status: Built 2026-10-29. The goal per search is a position and the units a day that position sells; our units a day are measured against it on the Top 3 page (goal pill, dashed goal line, North star table) and on the Whole account page. Goals: intel/<family>/goals.json (position, optional units a day, set and review dates); searches without an entry get a default goal.

## Build order after Halloween
7 (rule pill) → 4 (placement split) → 1 (windows) → 8 (goal columns) → 6 (banner schedule, out-of-budget strip, hourly orders) → 10 (test log on History) → 11 → 12 → 9 → 2 (Sponsored Display, portfolios) → 13 and 14 after their decisions.
