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
