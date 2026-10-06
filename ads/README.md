# ads/ — Amazon Ads optimization

Three pieces, all standard-library Python 3.10+:

| File               | What it does                                                     | Needs credentials |
|--------------------|------------------------------------------------------------------|-------------------|
| `playbook.md`      | The rulebook (Trivium / Mina Elias framework plus our defaults)  | no                |
| `config.json`      | Thresholds and account defaults (committed, nothing sensitive)   | no                |
| `parents.json`     | ASINs, prices, margins, stage per parent (gitignored)            | no                |
| `pull_snapshot.py` | Downloads the whole SP account plus 90 days of reports           | yes (Ads API)     |
| `audit.py`         | Scores a snapshot against the playbook, writes findings          | no                |

`pull_snapshot.py` imports `adsapi.py` from the private
`frolovdo/bodyj4you-amazon-api` repo. It looks, in order, at `$ADSAPI_DIR`,
`../bodyj4you-amazon-api`, `~/sp-api`.

## Run on the Mac (keys in the keychain)

```sh
cd ~/bodyj4you/ads
cp parents.example.json parents.json     # once; fill in ASINs, prices, margins, stage
python3 pull_snapshot.py --asins B0XXXXXXXX B0YYYYYYYY     # one product's campaigns
python3 audit.py --parent ROSEHIP        # -> ads/data/audits/<date>/findings.md
```

Puller scope: `--campaigns` takes ids or name substrings, `--asins` selects
every campaign advertising those ASINs. Structure lists are filtered on the
server. Reports are account-wide requests regardless (the Ads API has no
campaign filter on reports), so a scoped pull costs the same number of report
calls; rows are filtered after download. `--days 30` shortens the window,
`--skip-reports` pulls structure only, `--profile` overrides `ADS_PROFILE_ID`.

Audit scope: `--parent CODE` or `--asin ASIN` keeps only campaigns that
advertise those products. Campaigns that also advertise other products stay in
and are marked **mixed**. `--min-dollars 25` drops performance findings under
$25; structural findings always stay.

## Run anywhere else

Set the variables listed in `bodyj4you-amazon-api/CLOUD.md` (`ADS_CLIENT_ID`,
`ADS_CLIENT_SECRET`, `ADS_REFRESH_TOKEN`, `ADS_REGION`, `ADS_PROFILE_ID`) and
run the same two commands. For a cloud Claude session, that means the
environment's encrypted secrets. For GitHub Actions, repository secrets.

## Data layout

```
ads/data/                      gitignored
  snapshots/<YYYY-MM-DD>/
    profiles.json
    portfolios.json
    campaigns.json  adgroups.json  keywords.json  targets.json  product_ads.json
    neg_keywords.json  campaign_neg_keywords.json  neg_targets.json  campaign_neg_targets.json
    budget_usage.json
    report_search_terms.json  report_targeting.json  report_placements.json
    report_campaigns_daily.json  report_advertised_products.json
    manifest.json
  audits/<YYYY-MM-DD>/
    findings.json  findings.md  actions.csv
```

## Config keys that matter

`config.json` (committed):

- `account.brand_terms`: strings that mark a keyword as branded (playbook: branded keywords get their own campaigns).
- `account.stage_phase`: maps a parent's `stage` to its optimization phase. A parent with a stage gets findings
  from the other phase listed as deferred. Parents without a stage get everything.
- `thresholds.harvest_allow_one_order`: off by default. One-order search terms are noise at our volumes.
- `thresholds.min_finding_dollars`: default floor for performance findings; `--min-dollars` overrides per run.

`parents.json` (gitignored, copy from `parents.example.json`):

- `<CODE>.asins`: either a list, or a dict `{asin: {"label": "16oz", "price": 24.99}}`. Per-ASIN prices feed the
  starting-bid formula (price × parent CVR × target ACoS) with a unit-weighted price per ad group, so a 4oz and a
  16oz in one ad group no longer share one price.
- `<CODE>.stage`, `break_even_acos`, `target_acos`, optional group-level `price` used when an ASIN has none.

Margins and ASINs never go in `config.json`, so nothing sensitive lands in the public repo.

Nothing here writes to Amazon. Write-back (bid changes, negatives, new
campaigns) is a separate step that will run from reviewed `actions.csv`.

## Smoke test

```sh
python3 tests/test_audit.py
```

Builds a synthetic snapshot and checks each rule fires on its fixture.
