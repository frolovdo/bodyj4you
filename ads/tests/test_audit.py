#!/usr/bin/env python3
"""Smoke test: build a synthetic snapshot where each playbook rule should fire once, run audit.py, assert."""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import audit  # noqa: E402


def row(**kw):
    base = dict(impressions=1000, clicks=0, cost=0, purchases7d=0, sales7d=0, startDate="2026-07-01", endDate="2026-09-30")
    base.update(kw)
    return base


def build(snap_dir):
    campaigns = [
        {"campaignId": 1, "name": "SP | PA | AUTO-CLOSE", "state": "ENABLED", "targetingType": "AUTO", "portfolioId": 900,
         "budget": {"budget": 20.0}, "dynamicBidding": {"strategy": "LEGACY_FOR_SALES", "placementBidding": []}},
        {"campaignId": 2, "name": "SP | PA | B | messy", "state": "ENABLED", "targetingType": "MANUAL", "portfolioId": 900,
         "budget": {"budget": 10.0}, "dynamicBidding": {"strategy": "AUTO_FOR_SALES", "placementBidding": []}},
        {"campaignId": 3, "name": "SP | PA | E | winner", "state": "ENABLED", "targetingType": "MANUAL",
         "budget": {"budget": 10.0}, "dynamicBidding": {"strategy": "LEGACY_FOR_SALES",
                                                        "placementBidding": [{"placement": "PLACEMENT_PRODUCT_PAGE", "percentage": 50}]}},
    ]
    adgroups = [
        {"adGroupId": 10, "campaignId": 1, "name": "auto", "state": "ENABLED"},
        {"adGroupId": 20, "campaignId": 2, "name": "mixed", "state": "ENABLED"},
        {"adGroupId": 21, "campaignId": 2, "name": "second", "state": "ENABLED"},
        {"adGroupId": 30, "campaignId": 3, "name": "exact", "state": "ENABLED"},
    ]
    keywords = [{"keywordId": 100 + i, "campaignId": 2, "adGroupId": 20, "state": "ENABLED", "bid": 0.5,
                 "keywordText": "piercing aftercare %d" % i, "matchType": "BROAD"} for i in range(6)]
    keywords.append({"keywordId": 199, "campaignId": 2, "adGroupId": 20, "state": "ENABLED", "bid": 0.5,
                     "keywordText": "saline spray", "matchType": "PHRASE"})
    keywords.append({"keywordId": 300, "campaignId": 3, "adGroupId": 30, "state": "ENABLED", "bid": 0.8,
                     "keywordText": "piercing aftercare spray", "matchType": "EXACT"})
    keywords.append({"keywordId": 301, "campaignId": 2, "adGroupId": 21, "state": "ENABLED", "bid": 0.8,
                     "keywordText": "piercing aftercare spray", "matchType": "EXACT"})  # overlap with 300
    keywords.append({"keywordId": 302, "campaignId": 3, "adGroupId": 30, "state": "ENABLED", "bid": 0.8,
                     "keywordText": "bodyj4you saline", "matchType": "EXACT"})  # branded mixed with generic
    targets = [{"targetId": 500, "campaignId": 2, "adGroupId": 20, "state": "ENABLED", "bid": 0.4,
                "expressionType": "MANUAL", "expression": [{"type": "ASIN_SAME_AS", "value": "B0COMPETIT"}]}]
    product_ads = [
        {"adId": 1, "campaignId": 1, "adGroupId": 10, "state": "ENABLED", "asin": "B0PARENT01"},
        {"adId": 2, "campaignId": 2, "adGroupId": 20, "state": "ENABLED", "asin": "B0PARENT01"},
        {"adId": 3, "campaignId": 2, "adGroupId": 20, "state": "ENABLED", "asin": "B0OTHERPAR"},
        {"adId": 4, "campaignId": 3, "adGroupId": 30, "state": "ENABLED", "asin": "B0PARENT01"},
    ]
    search_terms = [
        row(campaignId=1, campaignName="SP | PA | AUTO-CLOSE", adGroupId=10, adGroupName="auto", keywordType="QUERY_HIGH_REL_MATCHES",
            matchType="TARGETING_EXPRESSION_PREDEFINED", searchTerm="nose ring cleaner", clicks=20, cost=12.5),                   # waste (benchmark 18 clicks, $6.50)
        row(campaignId=1, campaignName="SP | PA | AUTO-CLOSE", adGroupId=10, adGroupName="auto", keywordType="QUERY_HIGH_REL_MATCHES",
            matchType="TARGETING_EXPRESSION_PREDEFINED", searchTerm="saline wound wash piercing", clicks=20, cost=9.0, purchases7d=3, sales7d=42.0),  # harvest
        row(campaignId=1, campaignName="SP | PA | AUTO-CLOSE", adGroupId=10, adGroupName="auto", keywordType="QUERY_HIGH_REL_MATCHES",
            matchType="TARGETING_EXPRESSION_PREDEFINED", searchTerm="ear piercing kit", clicks=12, cost=11.0),                       # $11 but only 12 clicks: under benchmark, no waste
        row(campaignId=2, campaignName="SP | PA | B | messy", adGroupId=20, adGroupName="mixed", keyword="saline spray",
            matchType="PHRASE", searchTerm="saline spray for piercings", clicks=30, cost=55.0, purchases7d=1, sales7d=14.0),      # never-negated spend
    ]
    targeting = [
        row(campaignId=2, campaignName="SP | PA | B | messy", adGroupId=20, adGroupName="mixed", keywordId=100, keyword="piercing aftercare 0",
            matchType="BROAD", keywordBid=0.5, adKeywordStatus="ENABLED", clicks=35, cost=18.0),                                # pause
        row(campaignId=2, campaignName="SP | PA | B | messy", adGroupId=20, adGroupName="mixed", keywordId=101, keyword="piercing aftercare 1",
            matchType="BROAD", keywordBid=0.5, adKeywordStatus="ENABLED", clicks=25, cost=15.0, purchases7d=1, sales7d=14.0),  # bleed (ACoS 107%)
        row(campaignId=3, campaignName="SP | PA | E | winner", adGroupId=30, adGroupName="exact", keywordId=300, keyword="piercing aftercare spray",
            matchType="EXACT", keywordBid=0.8, adKeywordStatus="ENABLED", clicks=120, cost=60.0, purchases7d=15, sales7d=210.0, topOfSearchImpressionShare=12.0),  # scale
        row(campaignId=2, campaignName="SP | PA | B | messy", adGroupId=20, adGroupName="mixed", keywordId=105, keyword="piercing aftercare 5",
            matchType="BROAD", keywordBid=0.2, adKeywordStatus="ENABLED", impressions=12),                                       # zombie
    ]
    placements = [
        row(campaignId=3, campaignName="SP | PA | E | winner", placementClassification="Top of Search on-Amazon", clicks=60, cost=30.0, purchases7d=12, sales7d=168.0),
        row(campaignId=3, campaignName="SP | PA | E | winner", placementClassification="Other on-Amazon", clicks=40, cost=20.0, purchases7d=3, sales7d=42.0),
        row(campaignId=3, campaignName="SP | PA | E | winner", placementClassification="Detail Page on-Amazon", clicks=40, cost=15.0, purchases7d=0, sales7d=0),  # cut modifier
    ]
    campaigns_daily = [row(date="2026-09-%02d" % d, campaignId=3, campaignName="SP | PA | E | winner", clicks=4, cost=2.0, purchases7d=1, sales7d=14.0) for d in range(1, 31)]
    budget_usage = [{"campaignId": 3, "budgetUsagePercent": 97.0, "budget": 10.0}]
    advertised = [row(campaignId=3, adGroupId=30, adId=4, advertisedAsin="B0PARENT01", advertisedSku="PA-01", clicks=120, cost=60.0, purchases7d=15, sales7d=210.0)]

    files = dict(campaigns=campaigns, adgroups=adgroups, keywords=keywords, targets=targets, product_ads=product_ads,
                 neg_keywords=[], campaign_neg_keywords=[], neg_targets=[], campaign_neg_targets=[], budget_usage=budget_usage,
                 portfolios=[{"portfolioId": 900, "name": "PA mixed"}], report_search_terms=search_terms, report_targeting=targeting, report_placements=placements,
                 report_campaigns_daily=campaigns_daily, report_advertised_products=advertised,
                 manifest={"pulled_at": "test", "days": 90, "profile_id": "test"})
    for k, v in files.items():
        with open(os.path.join(snap_dir, k + ".json"), "w") as fh:
            json.dump(v, fh)


def main():
    with open(os.path.join(os.path.dirname(HERE), "config.json")) as fh:
        cfg = json.load(fh)
    cfg["parents"] = {"PA-SALINE": {"asins": {"B0PARENT01": {"label": "4oz", "price": 12.99}}, "target_acos": 0.25, "break_even_acos": 0.40, "stage": "grow"},
                      "OTHER": {"asins": ["B0OTHERPAR"], "price": 9.99, "target_acos": 0.25, "break_even_acos": 0.40, "stage": "harvest"}}
    audit.load_parents(cfg, None)
    assert cfg["parents"]["OTHER"]["asins"]["B0OTHERPAR"]["price"] == 9.99, "list-form asins must inherit the parent price"
    with tempfile.TemporaryDirectory() as tmp:
        snap = os.path.join(tmp, "snap"); os.makedirs(snap)
        build(snap)
        findings, path = audit.run(snap, cfg, os.path.join(tmp, "out"))
        by_rule = {}
        for x in findings:
            by_rule.setdefault(x["rule"], []).append(x)
        expected = {
            "waste": lambda xs: any(x["target"] == "nose ring cleaner" for x in xs),
            "harvest": lambda xs: any(x["target"] == "saline wound wash piercing" for x in xs),
            "never-negated": lambda xs: any(x["campaign"] == "SP | PA | B | messy" for x in xs),
            "pause": lambda xs: any(x["target"] == "piercing aftercare 0" for x in xs),
            "bleed": lambda xs: any(x["target"] == "piercing aftercare 1" for x in xs),
            "scale": lambda xs: any(x["target"] == "piercing aftercare spray" and x["proposed"] > 0.8 for x in xs),
            "zombie": lambda xs: any(x["target"] == "piercing aftercare 5" for x in xs),
            "structure": lambda xs: len(xs) >= 4,  # >1 ad group, >5 targets, mixed match, kw+PT, 2 parents
            "overlap": lambda xs: any("piercing aftercare spray" in x["target"] for x in xs),
            "bidding": lambda xs: any(x["campaign"] == "SP | PA | B | messy" for x in xs),
            "budget": lambda xs: any(x["campaign"] == "SP | PA | E | winner" and x["proposed"] == 13 for x in xs),
            "placement": lambda xs: any("Top of Search" in x["target"] and x["proposed"] == 25 for x in xs)
                                    and any("Detail Page" in x["target"] and x["proposed"] == 0 for x in xs),
            "coverage": lambda xs: any(x["target"] == "PA-SALINE" for x in xs),
            "portfolio": lambda xs: any("holds 2 parents" in x["detail"] for x in xs) and any(x.get("campaign") == "SP | PA | E | winner" for x in xs),
            "branded": lambda xs: any(x["campaign"] == "SP | PA | E | winner" and "bodyj4you saline" in x["detail"] for x in xs),
            "budget-hold": lambda xs: True,
            "placement-cut": lambda xs: any("Detail Page" in x["target"] and x["proposed"] == 0 for x in xs),
        }
        expected["placement"] = lambda xs: any("Top of Search" in x["target"] and x["proposed"] == 25 for x in xs)
        # phase tagging: PA-SALINE is grow -> performance. waste/pause are "always" and never deferred; bleed is.
        waste = [x for x in findings if x["rule"] == "waste"]
        assert waste and not any(x["deferred"] for x in waste), "waste is actioned in either phase"
        assert [x["target"] for x in waste] == ["nose ring cleaner"], "12-click term under the statistical benchmark must not fire"
        assert "benchmark 18 clicks and $6.50" in waste[0]["detail"], waste[0]["detail"]
        pause = [x for x in findings if x["rule"] == "pause"]
        assert pause and not any(x["deferred"] for x in pause)
        assert "benchmark 23 clicks" in pause[0]["detail"], pause[0]["detail"]
        bleed = [x for x in findings if x["rule"] == "bleed"]
        assert bleed and all(x["deferred"] for x in bleed), "bleed stays a profitability finding"
        scale = [x for x in findings if x["rule"] == "scale"]
        assert scale and not any(x["deferred"] for x in scale), "scale on grow-stage parent must not be deferred"
        assert all("phase" in x for x in findings)
        # starting bid formula: ad group 20 is mixed (12.99 and 9.99, no unit data -> mean 11.49) x parent CVR (15/120)
        # x target 0.25 = 0.36; zombie at 0.20 steps up at most two steps to min(0.36, 0.30)
        zombie = [x for x in findings if x["rule"] == "zombie"][0]
        assert abs(zombie["proposed"] - 0.30) < 1e-6, zombie
        assert "formula bid $0.36" in zombie["detail"], zombie["detail"]
        # scope: only the OTHER parent -> only the mixed campaign 2 remains, flagged mixed
        scoped, _ = audit.run(snap, cfg, os.path.join(tmp, "out2"), parents=["OTHER"])
        camps = {x.get("campaign") for x in scoped if x.get("campaign")}
        assert camps == {"SP | PA | B | messy"}, camps
        assert all(x.get("mixed") for x in scoped if x.get("campaign")), "campaign 2 advertises two parents and must be marked mixed"
        # scope by ASIN with min-dollars: structural findings survive, small performance findings go
        scoped2, _ = audit.run(snap, cfg, os.path.join(tmp, "out3"), asins=["B0PARENT01"], min_dollars=100)
        assert any(x["rule"] == "structure" for x in scoped2)
        assert not any(x["rule"] == "waste" for x in scoped2), "waste $12.50 is under the $100 floor"
        assert any(x["rule"] == "scale" for x in scoped2), "scale $210 is above the floor"
        # stage default target ACoS when a parent has none of its own
        cfg2 = json.loads(json.dumps(cfg)); cfg2["parents"]["OTHER"].pop("target_acos")
        ix2 = audit.Index(audit.load_snapshot(snap), cfg2)
        assert ix2.target_acos_for_parent("OTHER") == 0.20, "harvest stage default"
        assert ix2.target_acos_for_parent("PA-SALINE") == 0.25, "explicit target wins"
        # one-order harvest is off by default
        assert not any(x["rule"] == "harvest" and "1 orders" in x["detail"] for x in findings)
        failed = [r for r, chk in expected.items() if not chk(by_rule.get(r, []))]
        print(open(path).read())
        if failed:
            print("FAILED rules:", failed)
            for r in failed:
                print(r, json.dumps(by_rule.get(r, []), indent=1)[:800])
            sys.exit(1)
        print("OK: all %d rules fired as expected (%d findings)" % (len(expected), len(findings)))


if __name__ == "__main__":
    main()
