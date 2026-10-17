#!/usr/bin/env python3
"""Regression tests for audit fixes found on the first real (ROSEHIP) run, 2026-10-05."""
import copy
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import audit  # noqa: E402

with open(os.path.join(os.path.dirname(HERE), "config.json")) as fh:
    BASE_CFG = json.load(fh)


def cfg_with(parents):
    cfg = copy.deepcopy(BASE_CFG)
    cfg["parents"] = parents
    return audit.load_parents(cfg, None)


def snap(**over):
    s = {k: [] for k in ("campaigns", "adgroups", "keywords", "targets", "product_ads", "neg_keywords",
                         "campaign_neg_keywords", "neg_targets", "campaign_neg_targets", "budget_usage", "portfolios",
                         "report_search_terms", "report_targeting", "report_placements", "report_campaigns_daily",
                         "report_advertised_products")}
    s["manifest"] = {}
    s.update(over)
    return s


def camp(cid, name, **kw):
    c = {"campaignId": cid, "name": name, "state": "ENABLED", "targetingType": "MANUAL", "budget": {"budget": 10.0},
         "dynamicBidding": {"strategy": "LEGACY_FOR_SALES", "placementBidding": []}}
    c.update(kw)
    return c


PARENTS = {"P": {"asins": {"B0PARENT01": {"price": 30.0}}, "target_acos": 0.3, "break_even_acos": 0.4}}


def test_mixed_adgroup_has_no_price():
    s = snap(campaigns=[camp(1, "mixed")], adgroups=[{"adGroupId": 10, "campaignId": 1, "name": "ag", "state": "ENABLED"}],
             product_ads=[{"campaignId": 1, "adGroupId": 10, "state": "ENABLED", "asin": "B0PARENT01"},
                          {"campaignId": 1, "adGroupId": 10, "state": "ENABLED", "asin": "B0OTHER001"}])
    ix = audit.Index(s, cfg_with(PARENTS))
    assert ix.adgroup_price("10") is None, "mixed ad group must not borrow one parent's price"


def test_bleed_never_proposes_higher_bid():
    s = snap(campaigns=[camp(1, "c")], adgroups=[{"adGroupId": 10, "campaignId": 1, "name": "ag", "state": "ENABLED"}],
             product_ads=[{"campaignId": 1, "adGroupId": 10, "state": "ENABLED", "asin": "B0PARENT01"}],
             report_advertised_products=[dict(campaignId=1, adGroupId=10, advertisedAsin="B0PARENT01", impressions=5000,
                                              clicks=200, cost=100, purchases7d=60, sales7d=1800)],
             report_targeting=[dict(campaignId=1, adGroupId=10, keywordId=7, keyword="k", keywordBid=1.00, impressions=900,
                                    clicks=12, cost=20.0, purchases7d=0, sales7d=0)])
    ix = audit.Index(s, cfg_with(PARENTS))
    out = []
    audit.rule_targets(s, ix, out)
    bleed = [x for x in out if x["rule"] == "bleed"]
    assert bleed, out
    assert bleed[0]["proposed"] < bleed[0]["current"], bleed[0]


def test_exact_only_ignores_paused_and_archived_keywords():
    s = snap(campaigns=[camp(1, "exact")],
             adgroups=[{"adGroupId": 10, "campaignId": 1, "name": "live", "state": "ENABLED"},
                       {"adGroupId": 11, "campaignId": 1, "name": "old", "state": "ARCHIVED"}],
             keywords=[{"keywordId": 1, "campaignId": 1, "adGroupId": 10, "state": "ENABLED", "keywordText": "a", "matchType": "EXACT"},
                       {"keywordId": 2, "campaignId": 1, "adGroupId": 10, "state": "PAUSED", "keywordText": "b", "matchType": "BROAD"},
                       {"keywordId": 3, "campaignId": 1, "adGroupId": 11, "state": "ARCHIVED", "keywordText": "c", "matchType": "PHRASE"}],
             report_search_terms=[dict(campaignId=1, adGroupId=10, searchTerm="a", matchType="EXACT", impressions=1000,
                                       clicks=40, cost=80.0, purchases7d=5, sales7d=60)])
    ix = audit.Index(s, cfg_with({}))
    out = []
    audit.rule_search_terms(s, ix, out)
    assert not [x for x in out if x["rule"] == "never-negated"], out


def test_archived_adgroup_not_counted():
    s = snap(campaigns=[camp(1, "one")],
             adgroups=[{"adGroupId": 10, "campaignId": 1, "name": "live", "state": "ENABLED"},
                       {"adGroupId": 11, "campaignId": 1, "name": "old", "state": "ARCHIVED"}])
    ix = audit.Index(s, cfg_with({}))
    out = []
    audit.rule_structure(s, ix, out)
    assert not [x for x in out if "ad groups in one campaign" in x["detail"]], out


def test_scoped_run_drops_zombies_in_mixed_campaigns():
    s = snap(campaigns=[camp(1, "mixed")], adgroups=[{"adGroupId": 10, "campaignId": 1, "name": "ag", "state": "ENABLED"}],
             product_ads=[{"campaignId": 1, "adGroupId": 10, "state": "ENABLED", "asin": "B0PARENT01"},
                          {"campaignId": 1, "adGroupId": 10, "state": "ENABLED", "asin": "B0OTHER001"}],
             report_targeting=[dict(campaignId=1, adGroupId=10, keywordId=7, keyword="idle", keywordBid=0.5,
                                    impressions=3, clicks=0, cost=0, purchases7d=0, sales7d=0)])
    with tempfile.TemporaryDirectory() as d:
        sd, od = os.path.join(d, "snap"), os.path.join(d, "out")
        os.makedirs(sd)
        for k, v in s.items():
            with open(os.path.join(sd, k + ".json"), "w") as fh:
                json.dump(v, fh)
        findings, _ = audit.run(sd, cfg_with(PARENTS), od, parents=["P"])
    assert not [x for x in findings if x["rule"] == "zombie"], findings


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print("OK: %d regression tests passed" % len(tests))
