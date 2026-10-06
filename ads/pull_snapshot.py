#!/usr/bin/env python3
"""Download a full Sponsored Products snapshot via the Amazon Ads API.

Read-only. Writes JSON files to ads/data/snapshots/<date>/ (gitignored).
Imports adsapi.py from the private bodyj4you-amazon-api repo; credentials
resolve there (keychain on the Mac, env vars anywhere else).

Usage:
    python3 pull_snapshot.py [--profile ID] [--days 90] [--skip-reports] [--out DIR]
                             [--campaigns ID_OR_NAME ...] [--asins ASIN ...]

Scope: --campaigns takes campaign ids or case-insensitive name substrings;
--asins selects every campaign that advertises one of those ASINs. Structure
lists are filtered server-side; reports are account-wide requests (the Ads
API has no campaign filter on reports) and rows are filtered after download.
"""

import argparse
import datetime as dt
import gzip
import io
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def _import_adsapi():
    candidates = [
        os.environ.get("ADSAPI_DIR"),
        os.path.join(HERE, "..", "..", "bodyj4you-amazon-api"),
        os.path.expanduser("~/sp-api"),
        os.path.expanduser("~/bodyj4you-amazon-api"),
    ]
    for c in candidates:
        if c and os.path.exists(os.path.join(c, "adsapi.py")):
            sys.path.insert(0, os.path.abspath(c))
            import adsapi  # noqa: E402
            return adsapi
    sys.exit("adsapi.py not found. Set ADSAPI_DIR to the bodyj4you-amazon-api checkout.")


# ---------------------------------------------------------------- v3 list APIs
# path, content-type vendor string, response key
LIST_ENDPOINTS = {
    "campaigns":               ("/sp/campaigns/list",               "spCampaign",                        "campaigns"),
    "adgroups":                ("/sp/adGroups/list",                "spAdGroup",                         "adGroups"),
    "keywords":                ("/sp/keywords/list",                "spKeyword",                         "keywords"),
    "targets":                 ("/sp/targets/list",                 "spTargetingClause",                 "targetingClauses"),
    "product_ads":             ("/sp/productAds/list",              "spProductAd",                       "productAds"),
    "neg_keywords":            ("/sp/negativeKeywords/list",        "spNegativeKeyword",                 "negativeKeywords"),
    "campaign_neg_keywords":   ("/sp/campaignNegativeKeywords/list","spCampaignNegativeKeyword",         "campaignNegativeKeywords"),
    "neg_targets":             ("/sp/negativeTargets/list",         "spNegativeTargetingClause",         "negativeTargetingClauses"),
    "campaign_neg_targets":    ("/sp/campaignNegativeTargets/list", "spCampaignNegativeTargetingClause", "campaignNegativeTargetingClauses"),
}


def list_all(ads, path, vendor, key, profile, extra_body=None, campaign_ids=None):
    """Paginate a v3 list endpoint. campaign_ids (iterable of str) adds a server-side campaignIdFilter in chunks of 100."""
    ctype = "application/vnd.%s.v3+json" % vendor
    chunks = [None]
    if campaign_ids is not None:
        ids = sorted(set(str(c) for c in campaign_ids))
        if not ids:
            return []
        chunks = [ids[i:i + 100] for i in range(0, len(ids), 100)]
    out = []
    for chunk in chunks:
        token = None
        while True:
            body = {"maxResults": 100}
            if extra_body:
                body.update(extra_body)
            if chunk is not None:
                body["campaignIdFilter"] = {"include": chunk}
            if token:
                body["nextToken"] = token
            res = ads.request("POST", path, body=body, profile=profile,
                              accept=ctype, content_type=ctype)
            out.extend(res.get(key, []))
            token = res.get("nextToken")
            if not token:
                break
    return out


def select_campaigns(campaigns, product_ads, wanted_campaigns, wanted_asins):
    """Resolve --campaigns / --asins into a set of campaign id strings."""
    if not wanted_campaigns and not wanted_asins:
        return None
    sel = set()
    for w in wanted_campaigns or []:
        wl = w.lower()
        for c in campaigns:
            if str(c["campaignId"]) == w or wl in (c.get("name") or "").lower():
                sel.add(str(c["campaignId"]))
    asins = {a.upper() for a in (wanted_asins or [])}
    if asins:
        for pa in product_ads:
            if (pa.get("asin") or "").upper() in asins:
                sel.add(str(pa["campaignId"]))
    return sel


def portfolios(ads, profile):
    ctype = "application/vnd.spPortfolio.v3+json"
    out, token = [], None
    while True:
        body = {"maxResults": 100}
        if token:
            body["nextToken"] = token
        res = ads.request("POST", "/portfolios/list", body=body, profile=profile,
                          accept=ctype, content_type=ctype)
        out.extend(res.get("portfolios", []))
        token = res.get("nextToken")
        if not token:
            return out


def budget_usage(ads, profile, campaign_ids):
    ctype = "application/vnd.spcampaignbudgetusage.v1+json"
    out = []
    for i in range(0, len(campaign_ids), 100):
        chunk = [str(c) for c in campaign_ids[i:i + 100]]
        try:
            res = ads.request("POST", "/sp/campaigns/budget/usage",
                              body={"campaignIds": chunk}, profile=profile,
                              accept=ctype, content_type=ctype)
            out.extend(res.get("success", []))
        except ads.AdsError as e:
            sys.stderr.write("  budget usage chunk failed: %s\n" % str(e)[:200])
    return out


# ------------------------------------------------------------------ reports v3
BASE_METRICS = ["impressions", "clicks", "cost", "costPerClick", "clickThroughRate",
                "purchases7d", "sales7d", "unitsSoldClicks7d", "purchases14d", "sales14d"]

REPORTS = {
    "search_terms": {
        "reportTypeId": "spSearchTerm", "groupBy": ["searchTerm"], "timeUnit": "SUMMARY",
        "columns": ["campaignId", "campaignName", "campaignStatus", "campaignBudgetAmount",
                    "adGroupId", "adGroupName", "keywordId", "keyword", "keywordType",
                    "matchType", "targeting", "searchTerm", "keywordBid", "adKeywordStatus",
                    "startDate", "endDate"] + BASE_METRICS,
    },
    "targeting": {
        "reportTypeId": "spTargeting", "groupBy": ["targeting"], "timeUnit": "SUMMARY",
        "columns": ["campaignId", "campaignName", "campaignStatus", "adGroupId", "adGroupName",
                    "keywordId", "keyword", "keywordType", "matchType", "targeting",
                    "keywordBid", "adKeywordStatus", "topOfSearchImpressionShare",
                    "startDate", "endDate"] + BASE_METRICS,
    },
    "placements": {
        "reportTypeId": "spCampaigns", "groupBy": ["campaignPlacement"], "timeUnit": "SUMMARY",
        "columns": ["campaignId", "campaignName", "placementClassification",
                    "startDate", "endDate"] + BASE_METRICS,
    },
    "campaigns_daily": {
        "reportTypeId": "spCampaigns", "groupBy": ["campaign"], "timeUnit": "DAILY",
        "columns": ["date", "campaignId", "campaignName", "campaignStatus",
                    "campaignBudgetAmount", "campaignBiddingStrategy",
                    "topOfSearchImpressionShare"] + BASE_METRICS,
    },
    "advertised_products": {
        "reportTypeId": "spAdvertisedProduct", "groupBy": ["advertiser"], "timeUnit": "SUMMARY",
        "columns": ["campaignId", "campaignName", "adGroupId", "adGroupName", "adId",
                    "advertisedAsin", "advertisedSku", "startDate", "endDate"] + BASE_METRICS,
    },
}

REPORT_CTYPE = "application/vnd.createasyncreportrequest.v3+json"
MAX_WINDOW = 31  # Ads API caps a single SP report at 31 days


def windows(days, lag):
    """Yield (start, end) date pairs of <= MAX_WINDOW days covering the lookback."""
    end = dt.date.today() - dt.timedelta(days=lag)
    start = end - dt.timedelta(days=days - 1)
    cur = start
    while cur <= end:
        stop = min(cur + dt.timedelta(days=MAX_WINDOW - 1), end)
        yield cur, stop
        cur = stop + dt.timedelta(days=1)


def submit_report(ads, profile, name, spec, start, end):
    body = {
        "name": "%s %s..%s" % (name, start, end),
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "configuration": {
            "adProduct": "SPONSORED_PRODUCTS",
            "groupBy": spec["groupBy"],
            "columns": spec["columns"],
            "reportTypeId": spec["reportTypeId"],
            "timeUnit": spec["timeUnit"],
            "format": "GZIP_JSON",
        },
    }
    res = ads.request("POST", "/reporting/reports", body=body, profile=profile,
                      accept=REPORT_CTYPE, content_type=REPORT_CTYPE)
    return res["reportId"]


def poll_reports(ads, profile, pending, timeout=1800, every=20):
    """pending: {reportId: (name, start, end)} -> {reportId: rows}."""
    done, t0 = {}, time.time()
    while pending and time.time() - t0 < timeout:
        for rid in list(pending):
            res = ads.request("GET", "/reporting/reports/%s" % rid, profile=profile,
                              accept="application/vnd.getasyncreportresponse.v3+json")
            status = res.get("status")
            if status == "COMPLETED":
                with urllib.request.urlopen(res["url"], timeout=120) as r:
                    raw = r.read()
                try:
                    raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
                except OSError:
                    pass
                done[rid] = json.loads(raw.decode())
                name, s, e = pending.pop(rid)
                sys.stderr.write("  report %s %s..%s: %d rows\n" % (name, s, e, len(done[rid])))
            elif status == "FAILURE":
                name, s, e = pending.pop(rid)
                sys.stderr.write("  report %s %s..%s FAILED: %s\n" % (name, s, e, res.get("failureReason")))
                done[rid] = []
        if pending:
            time.sleep(every)
    for rid, (name, s, e) in pending.items():
        sys.stderr.write("  report %s %s..%s timed out\n" % (name, s, e))
        done[rid] = []
    return done


# ------------------------------------------------------------------------ main
def dump(out_dir, name, obj):
    path = os.path.join(out_dir, name + ".json")
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=1, ensure_ascii=False)
    n = len(obj) if isinstance(obj, list) else 1
    sys.stderr.write("  %-32s %6d\n" % (name, n))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--profile", help="Ads profile id (default ADS_PROFILE_ID)")
    ap.add_argument("--days", type=int, default=90, help="report lookback (default 90)")
    ap.add_argument("--lag", type=int, default=3, help="days to drop for attribution lag (default 3)")
    ap.add_argument("--skip-reports", action="store_true", help="structure only, no performance reports")
    ap.add_argument("--out", help="output dir (default ads/data/snapshots/<today>)")
    ap.add_argument("--campaigns", nargs="+", metavar="ID_OR_NAME", help="only these campaigns (ids or name substrings)")
    ap.add_argument("--asins", nargs="+", metavar="ASIN", help="only campaigns advertising these ASINs")
    args = ap.parse_args(argv)

    ads = _import_adsapi()
    ads.load_env()
    profile = args.profile or os.environ.get("ADS_PROFILE_ID")

    out_dir = args.out or os.path.join(HERE, "data", "snapshots", dt.date.today().isoformat())
    os.makedirs(out_dir, exist_ok=True)
    sys.stderr.write("snapshot -> %s\n" % out_dir)

    profs = ads.request("GET", "/v2/profiles")
    dump(out_dir, "profiles", profs)
    if not profile:
        us = [p for p in profs if p.get("countryCode") == "US" and p.get("accountInfo", {}).get("type") == "seller"]
        if len(us) == 1:
            profile = str(us[0]["profileId"])
            sys.stderr.write("  using the only US seller profile: %s\n" % profile)
        else:
            sys.exit("Set ADS_PROFILE_ID or pass --profile. Profiles: %s"
                     % ", ".join("%s=%s/%s" % (p["profileId"], p.get("countryCode"),
                                               p.get("accountInfo", {}).get("type")) for p in profs))

    dump(out_dir, "portfolios", portfolios(ads, profile))
    data = {}
    # campaigns and product ads first: they are cheap and decide the scope
    path, vendor, key = LIST_ENDPOINTS["campaigns"]
    all_campaigns = list_all(ads, path, vendor, key, profile)
    path, vendor, key = LIST_ENDPOINTS["product_ads"]
    all_ads = list_all(ads, path, vendor, key, profile)
    scope = select_campaigns(all_campaigns, all_ads, args.campaigns, args.asins)
    if scope is not None:
        sys.stderr.write("scope: %d of %d campaigns match --campaigns/--asins\n" % (len(scope), len(all_campaigns)))
        if not scope:
            sys.exit("No campaign matched. Check --campaigns / --asins against profile %s." % profile)
    data["campaigns"] = [c for c in all_campaigns if scope is None or str(c["campaignId"]) in scope]
    data["product_ads"] = [a for a in all_ads if scope is None or str(a["campaignId"]) in scope]
    dump(out_dir, "campaigns", data["campaigns"])
    dump(out_dir, "product_ads", data["product_ads"])
    for name, (path, vendor, key) in LIST_ENDPOINTS.items():
        if name in data:
            continue
        data[name] = list_all(ads, path, vendor, key, profile, campaign_ids=scope)
        dump(out_dir, name, data[name])

    camp_ids = [c["campaignId"] for c in data["campaigns"] if c.get("state") == "ENABLED"]
    dump(out_dir, "budget_usage", budget_usage(ads, profile, camp_ids))

    manifest = {
        "pulled_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "profile_id": profile, "days": args.days, "lag": args.lag,
        "scope": {"campaigns": args.campaigns, "asins": args.asins,
                  "campaign_ids": sorted(scope) if scope is not None else "all"},
        "reports": {},
    }

    if not args.skip_reports:
        pending = {}
        for name, spec in REPORTS.items():
            for s, e in windows(args.days, args.lag):
                rid = submit_report(ads, profile, name, spec, s, e)
                pending[rid] = (name, s, e)
                manifest["reports"].setdefault(name, []).append({"reportId": rid, "start": s.isoformat(), "end": e.isoformat()})
        sys.stderr.write("submitted %d reports, polling...\n" % len(pending))
        results = poll_reports(ads, profile, dict(pending))
        for name in REPORTS:
            rows = []
            for rid, (n, s, e) in pending.items():
                if n == name:
                    rows.extend(results.get(rid, []))
            if scope is not None:
                rows = [r for r in rows if str(r.get("campaignId")) in scope]
            dump(out_dir, "report_" + name, rows)

    dump(out_dir, "manifest", manifest)
    print(out_dir)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:  # adsapi.AdsError is only importable after _import_adsapi
        if type(e).__name__ == "AdsError":
            sys.stderr.write("error: %s\n" % e)
            sys.exit(1)
        raise
