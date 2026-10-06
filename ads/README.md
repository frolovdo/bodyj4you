# ads/ — Amazon Ads optimization

Three pieces, all standard-library Python 3.10+:

| File               | What it does                                                     | Needs credentials |
|--------------------|------------------------------------------------------------------|-------------------|
| `playbook.md`      | The rulebook (Trivium / Mina Elias framework plus our defaults)  | no                |
| `config.json`      | Thresholds and per-parent targets the audit reads                | no                |
| `pull_snapshot.py` | Downloads the whole SP account plus 90 days of reports           | yes (Ads API)     |
| `audit.py`         | Scores a snapshot against the playbook, writes findings          | no                |

`pull_snapshot.py` imports `adsapi.py` from the private
`frolovdo/bodyj4you-amazon-api` repo. It looks, in order, at `$ADSAPI_DIR`,
`../bodyj4you-amazon-api`, `~/sp-api`.

## Run on the Mac (keys in the keychain)

```sh
cd ~/bodyj4you/ads
python3 pull_snapshot.py                 # -> ads/data/snapshots/<date>/
python3 audit.py                         # -> ads/data/audits/<date>/findings.md
```

`pull_snapshot.py --profile <id>` overrides `ADS_PROFILE_ID`. `--days 30`
shortens the report window. `--skip-reports` pulls structure only, which
takes seconds instead of minutes.

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

- `account.brand_terms`: strings that mark a keyword as branded (playbook: branded keywords get their own campaigns).
- `account.stage_phase`: maps a parent's `stage` to its optimization phase. A parent with a stage gets findings
  from the other phase listed as deferred. Parents without a stage get everything.
- `parents.<CODE>`: `asins`, `stage`, `price`, `break_even_acos`, `target_acos`. The audit maps campaigns to
  parents through advertised ASINs, so fill `asins` first.

Nothing here writes to Amazon. Write-back (bid changes, negatives, new
campaigns) is a separate step that will run from reviewed `actions.csv`.

## Smoke test

```sh
python3 tests/test_audit.py
```

Builds a synthetic snapshot and checks each rule fires on its fixture.
