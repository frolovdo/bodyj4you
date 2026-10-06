#!/usr/bin/env python3
"""Score a Sponsored Products snapshot against ads/playbook.md.

Read-only. Input: a directory written by pull_snapshot.py. Output: findings.json,
findings.md and actions.csv under ads/data/audits/<date>/.

Usage:
    python3 audit.py [--snapshot DIR] [--config config.json] [--out DIR]
"""

import argparse
import csv
import math
import datetime as dt
import glob
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))

AUTO_TYPES = {"QUERY_HIGH_REL_MATCHES", "QUERY_BROAD_REL_MATCHES", "ASIN_SUBSTITUTE_RELATED",
              "ASIN_ACCESSORY_RELATED"}
HARVESTABLE_MATCH = {"BROAD", "PHRASE", "TARGETING_EXPRESSION_PREDEFINED", "TARGETING_EXPRESSION"}


# ------------------------------------------------------------------ loading
def load_snapshot(snap_dir):
    def rd(name):
        p = os.path.join(snap_dir, name + ".json")
        if not os.path.exists(p):
            return []
        with open(p) as fh:
            return json.load(fh)
    names = ["campaigns", "adgroups", "keywords", "targets", "product_ads", "neg_keywords",
             "campaign_neg_keywords", "neg_targets", "campaign_neg_targets", "budget_usage",
             "portfolios", "report_search_terms", "report_targeting", "report_placements",
             "report_campaigns_daily", "report_advertised_products"]
    snap = {n: rd(n) for n in names}
    snap["manifest"] = rd("manifest") or {}
    return snap


def latest_snapshot():
    dirs = sorted(glob.glob(os.path.join(HERE, "data", "snapshots", "*")))
    if not dirs:
        sys.exit("No snapshot under ads/data/snapshots. Run pull_snapshot.py first.")
    return dirs[-1]


def f(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def money(x):
    return "$%s" % format(round(x, 2), ",.2f")


def pct(x):
    return "%.0f%%" % (100 * x)


def acos(cost, sales):
    return cost / sales if sales else float("inf")


def roas(cost, sales):
    return sales / cost if cost else 0.0


# ------------------------------------------------------------------ indexes
class Index:
    def __init__(self, snap, cfg):
        self.cfg = cfg
        self.t = cfg["thresholds"]
        self.camp = {str(c["campaignId"]): c for c in snap["campaigns"]}
        self.ag = {str(a["adGroupId"]): a for a in snap["adgroups"]}
        self.ag_by_camp = defaultdict(list)
        for a in snap["adgroups"]:
            self.ag_by_camp[str(a["campaignId"])].append(a)
        self.kw_by_ag = defaultdict(list)
        for k in snap["keywords"]:
            self.kw_by_ag[str(k["adGroupId"])].append(k)
        self.tg_by_ag = defaultdict(list)
        for t in snap["targets"]:
            self.tg_by_ag[str(t["adGroupId"])].append(t)
        self.ads_by_ag = defaultdict(list)
        for p in snap["product_ads"]:
            self.ads_by_ag[str(p["adGroupId"])].append(p)
        # negatives: set of (campaignId, adGroupId|None, text.lower(), matchType)
        self.negs = set()
        self.neg_count_by_camp = defaultdict(int)
        for n in snap["neg_keywords"]:
            if n.get("state") == "ENABLED":
                self.negs.add((str(n["campaignId"]), str(n["adGroupId"]), n["keywordText"].lower(), n["matchType"]))
                self.neg_count_by_camp[str(n["campaignId"])] += 1
        for n in snap["campaign_neg_keywords"]:
            if n.get("state") == "ENABLED":
                self.negs.add((str(n["campaignId"]), None, n["keywordText"].lower(), n["matchType"]))
                self.neg_count_by_camp[str(n["campaignId"])] += 1
        for n in snap["neg_targets"] + snap["campaign_neg_targets"]:
            if n.get("state") == "ENABLED":
                self.neg_count_by_camp[str(n["campaignId"])] += 1
        # exact keywords anywhere (enabled)
        self.exact_texts = set()
        self.kw_occurrences = defaultdict(set)  # (text, match) -> campaigns
        for k in snap["keywords"]:
            if k.get("state") != "ENABLED":
                continue
            txt = k["keywordText"].lower()
            if k["matchType"] == "EXACT":
                self.exact_texts.add(txt)
            if self.camp.get(str(k["campaignId"]), {}).get("state") == "ENABLED":
                self.kw_occurrences[(txt, k["matchType"])].add(str(k["campaignId"]))
        self.budget_usage = {str(b["campaignId"]): b for b in snap["budget_usage"]}
        # parent lookup by ASIN
        self.parent_by_asin = {}
        for code, p in cfg.get("parents", {}).items():
            if code.startswith("_"):
                continue
            for a in p.get("asins", []):
                self.parent_by_asin[a] = code

    def is_negated(self, camp_id, ag_id, term):
        term = term.lower()
        for scope in (str(ag_id), None):
            if (camp_id, scope, term, "NEGATIVE_EXACT") in self.negs:
                return True
            for (c, s, text, mt) in self.negs:
                if c == camp_id and s == scope and mt == "NEGATIVE_PHRASE" and text in term:
                    return True
        return False

    def target_acos_for_campaign(self, camp_id):
        asins = {p.get("asin") for ag in self.ag_by_camp.get(camp_id, []) for p in self.ads_by_ag.get(str(ag["adGroupId"]), [])}
        for a in asins:
            code = self.parent_by_asin.get(a)
            if code:
                return self.cfg["parents"][code].get("target_acos", self.cfg["account"]["default_target_acos"])
        return self.cfg["account"]["default_target_acos"]

    def campaign_name(self, camp_id):
        return self.camp.get(str(camp_id), {}).get("name", str(camp_id))


# ------------------------------------------------------------------ rules
def aggregate(rows, key_fn):
    agg = defaultdict(lambda: {"impressions": 0, "clicks": 0, "cost": 0.0, "orders": 0, "sales": 0.0, "row": None})
    for r in rows:
        k = key_fn(r)
        if k is None:
            continue
        a = agg[k]
        a["impressions"] += int(f(r.get("impressions")))
        a["clicks"] += int(f(r.get("clicks")))
        a["cost"] += f(r.get("cost"))
        a["orders"] += int(f(r.get("purchases7d")))
        a["sales"] += f(r.get("sales7d"))
        a["row"] = r
    return agg


def rule_structure(snap, ix, out):
    t = ix.t
    for cid, c in ix.camp.items():
        if c.get("state") != "ENABLED":
            continue
        ags = ix.ag_by_camp.get(cid, [])
        if len(ags) > 1:
            out.append(dict(rule="structure", severity="medium", campaign=c["name"],
                            detail="%d ad groups in one campaign (playbook: one)" % len(ags),
                            action="split into one campaign per ad group", dollars=0))
        strat = (c.get("dynamicBidding") or {}).get("strategy")
        if strat == "AUTO_FOR_SALES":
            out.append(dict(rule="bidding", severity="low", campaign=c["name"],
                            detail="dynamic bids up and down", action="review; playbook default is down only plus placement modifiers", dollars=0))
        for ag in ags:
            agid = str(ag["adGroupId"])
            kws = [k for k in ix.kw_by_ag.get(agid, []) if k.get("state") == "ENABLED"]
            tgs = [x for x in ix.tg_by_ag.get(agid, []) if x.get("state") == "ENABLED"]
            manual_tgs = [x for x in tgs if x.get("expressionType") == "MANUAL"]
            n = len(kws) + len(manual_tgs)
            if n > t["max_targets_per_adgroup"]:
                out.append(dict(rule="structure", severity="medium", campaign=c["name"], adgroup=ag["name"],
                                detail="%d targets in ad group (max %d)" % (n, t["max_targets_per_adgroup"]),
                                action="split into campaigns of <= %d targets" % t["max_targets_per_adgroup"], dollars=0))
            matches = {k["matchType"] for k in kws}
            if len(matches) > 1:
                out.append(dict(rule="structure", severity="medium", campaign=c["name"], adgroup=ag["name"],
                                detail="mixed match types: %s" % ", ".join(sorted(matches)),
                                action="one match type per campaign", dollars=0))
            if kws and manual_tgs:
                out.append(dict(rule="structure", severity="medium", campaign=c["name"], adgroup=ag["name"],
                                detail="keywords and product targets in one ad group",
                                action="separate keyword and product-target campaigns", dollars=0))
            parents = {ix.parent_by_asin.get(p.get("asin"), p.get("asin")) for p in ix.ads_by_ag.get(agid, []) if p.get("state") == "ENABLED"}
            if len(parents) > 1:
                out.append(dict(rule="structure", severity="low", campaign=c["name"], adgroup=ag["name"],
                                detail="%d parents/ASINs advertised together" % len(parents),
                                action="one parent per campaign unless true variations", dollars=0))
    for (txt, mt), camps in ix.kw_occurrences.items():
        if len(camps) > 1:
            out.append(dict(rule="overlap", severity="medium", target="%s [%s]" % (txt, mt),
                            detail="enabled in %d campaigns: %s" % (len(camps), "; ".join(ix.campaign_name(c) for c in sorted(camps))),
                            action="keep one, pause the rest", dollars=0))


def rule_search_terms(snap, ix, out):
    t = ix.t
    rows = snap["report_search_terms"]
    agg = aggregate(rows, lambda r: (str(r.get("campaignId")), str(r.get("adGroupId")), (r.get("searchTerm") or "").lower()))
    for (cid, agid, term), a in agg.items():
        if not term:
            continue
        r = a["row"]
        mt = (r.get("matchType") or "").upper()
        ctype = ix.camp.get(cid, {}).get("targetingType", "")
        harvestable = ctype == "AUTO" or mt in HARVESTABLE_MATCH or (r.get("keywordType") or "").upper() in AUTO_TYPES
        if not harvestable:
            continue
        cname = ix.campaign_name(cid)
        tgt = ix.target_acos_for_campaign(cid)
        # waste
        if a["cost"] >= t["waste_spend_min"] and a["orders"] == 0 and not ix.is_negated(cid, agid, term):
            out.append(dict(rule="waste", severity="high", campaign=cname, adgroup=r.get("adGroupName"), target=term,
                            detail="%s spend, %d clicks, 0 orders" % (money(a["cost"]), a["clicks"]),
                            action="add negative exact in this campaign", dollars=a["cost"]))
        # harvest
        is_asin = term.startswith("b0") and len(term) == 10
        already = term in ix.exact_texts
        ok = a["orders"] >= t["harvest_min_orders"] or (a["orders"] == 1 and acos(a["cost"], a["sales"]) <= tgt * t["harvest_one_order_max_acos_ratio"])
        if ok and not already and not is_asin:
            out.append(dict(rule="harvest", severity="medium", campaign=cname, adgroup=r.get("adGroupName"), target=term,
                            detail="%d orders, %s sales, ACoS %s in %s" % (a["orders"], money(a["sales"]), pct(acos(a["cost"], a["sales"])), mt or ctype),
                            action="create exact campaign; negative exact here", dollars=a["sales"]))
        if ok and not already and is_asin:
            out.append(dict(rule="harvest", severity="low", campaign=cname, adgroup=r.get("adGroupName"), target=term.upper(),
                            detail="ASIN converting %d orders in auto" % a["orders"],
                            action="create product-targeting campaign for this ASIN", dollars=a["sales"]))
    # never negated
    spend_by_camp = defaultdict(float)
    for r in rows:
        spend_by_camp[str(r.get("campaignId"))] += f(r.get("cost"))
    for cid, spend in spend_by_camp.items():
        c = ix.camp.get(cid, {})
        if c.get("state") != "ENABLED":
            continue
        kws = [k for ag in ix.ag_by_camp.get(cid, []) for k in ix.kw_by_ag.get(str(ag["adGroupId"]), [])]
        exact_only = kws and all(k["matchType"] == "EXACT" for k in kws)
        if spend >= t["never_negated_spend_min"] and ix.neg_count_by_camp.get(cid, 0) == 0 and not exact_only:
            out.append(dict(rule="never-negated", severity="medium", campaign=c.get("name"),
                            detail="%s spend in window, zero negatives" % money(spend),
                            action="run the negation pass", dollars=0))


def rule_targets(snap, ix, out):
    t = ix.t
    agg = aggregate(snap["report_targeting"], lambda r: (str(r.get("campaignId")), str(r.get("adGroupId")), str(r.get("keywordId") or r.get("targeting"))))
    for (cid, agid, kid), a in agg.items():
        r = a["row"]
        cname = ix.campaign_name(cid)
        label = r.get("keyword") or r.get("targeting") or kid
        bid = f(r.get("keywordBid"))
        tgt = ix.target_acos_for_campaign(cid)
        ac, ro = acos(a["cost"], a["sales"]), roas(a["cost"], a["sales"])
        aov = a["sales"] / a["orders"] if a["orders"] else 0
        cvr = a["orders"] / a["clicks"] if a["clicks"] else 0
        formula_bid = round(aov * cvr * tgt, 2) if a["clicks"] >= t["min_clicks_for_own_cvr"] and a["orders"] else None
        if a["clicks"] >= t["pause_min_clicks"] and a["orders"] == 0:
            out.append(dict(rule="pause", severity="high", campaign=cname, adgroup=r.get("adGroupName"), target=label,
                            detail="%d clicks, %s spend, 0 orders" % (a["clicks"], money(a["cost"])),
                            action="pause target", dollars=a["cost"]))
        elif a["cost"] >= t["waste_spend_min"] and (a["orders"] == 0 or ac > t["bleed_acos"] or ro < t["bleed_roas"]):
            # small steps per playbook: one step down, never below the formula bid in one move
            stepped = round(max(bid - t["bid_step_down"], 0.02), 2)
            new_bid = max(stepped, formula_bid) if formula_bid else stepped
            target_note = (", formula bid %s" % money(formula_bid)) if formula_bid else ""
            out.append(dict(rule="bleed", severity="high", campaign=cname, adgroup=r.get("adGroupName"), target=label,
                            detail="%s spend, ACoS %s, ROAS %.1f, bid %s%s" % (money(a["cost"]), pct(ac) if ac != float("inf") else "n/a", ro, money(bid), target_note),
                            action="lower bid to %s" % money(new_bid), dollars=a["cost"] - a["sales"] * tgt, current=bid, proposed=new_bid))
        elif ro >= t["scale_roas"] and a["orders"] >= t["scale_min_orders"]:
            new_bid = round(bid + t["bid_step_up"], 2)
            if formula_bid and formula_bid > new_bid:
                new_bid = min(formula_bid, round(bid + 2 * t["bid_step_up"], 2))
            tos = r.get("topOfSearchImpressionShare")
            out.append(dict(rule="scale", severity="medium", campaign=cname, adgroup=r.get("adGroupName"), target=label,
                            detail="ROAS %.1f, %d orders, %s sales, TOS share %s, bid %s" % (ro, a["orders"], money(a["sales"]), ("%.0f%%" % f(tos)) if tos is not None else "n/a", money(bid)),
                            action="raise bid to %s" % money(new_bid), dollars=a["sales"], current=bid, proposed=new_bid))
        if a["impressions"] < t["zombie_max_impressions"] and (r.get("adKeywordStatus") or "ENABLED") == "ENABLED" and ix.camp.get(cid, {}).get("state") == "ENABLED":
            out.append(dict(rule="zombie", severity="low", campaign=cname, adgroup=r.get("adGroupName"), target=label,
                            detail="%d impressions in window, bid %s" % (a["impressions"], money(bid)),
                            action="raise bid or remove", dollars=0))


def rule_budget(snap, ix, out):
    t = ix.t
    camp_perf = aggregate(snap["report_campaigns_daily"], lambda r: str(r.get("campaignId")))
    for cid, b in ix.budget_usage.items():
        usage = f(b.get("budgetUsagePercent")) / 100.0
        if usage < t["budget_usage_capped"]:
            continue
        c = ix.camp.get(cid, {})
        p = camp_perf.get(cid)
        ro = roas(p["cost"], p["sales"]) if p else 0
        budget = f(b.get("budget")) or f((c.get("budget") or {}).get("budget"))
        if ro >= t["scale_roas"]:
            new_budget = float(math.ceil(budget * 1.25))
            out.append(dict(rule="budget", severity="high", campaign=c.get("name", cid),
                            detail="budget %s at %s used, ROAS %.1f" % (money(budget), pct(usage), ro),
                            action="raise budget to %s" % money(new_budget), dollars=p["sales"] if p else 0,
                            current=budget, proposed=new_budget))
        elif ro < t["bleed_roas"]:
            out.append(dict(rule="budget", severity="medium", campaign=c.get("name", cid),
                            detail="budget %s capped at %s used, ROAS %.1f" % (money(budget), pct(usage), ro),
                            action="lower bids before touching budget", dollars=0))


def rule_placements(snap, ix, out):
    t = ix.t
    by_camp = defaultdict(dict)
    for r in snap["report_placements"]:
        cid = str(r.get("campaignId"))
        pl = r.get("placementClassification") or "Other"
        a = by_camp[cid].setdefault(pl, {"cost": 0.0, "sales": 0.0, "orders": 0})
        a["cost"] += f(r.get("cost")); a["sales"] += f(r.get("sales7d")); a["orders"] += int(f(r.get("purchases7d")))
    for cid, pls in by_camp.items():
        c = ix.camp.get(cid, {})
        if c.get("state") != "ENABLED":
            continue
        mods = {m["placement"]: m["percentage"] for m in (c.get("dynamicBidding") or {}).get("placementBidding", [])}
        key_map = {"Top of Search on-Amazon": "PLACEMENT_TOP", "Detail Page on-Amazon": "PLACEMENT_PRODUCT_PAGE",
                   "Other on-Amazon": "PLACEMENT_REST_OF_SEARCH"}
        for pl, a in pls.items():
            others_cost = sum(v["cost"] for k, v in pls.items() if k != pl)
            others_sales = sum(v["sales"] for k, v in pls.items() if k != pl)
            ro, ro_other = roas(a["cost"], a["sales"]), roas(others_cost, others_sales)
            mod = mods.get(key_map.get(pl, ""), 0)
            if a["orders"] >= t["placement_min_orders"] and ro_other and ro >= t["placement_roas_ratio"] * ro_other and not mod:
                out.append(dict(rule="placement", severity="medium", campaign=c.get("name"), target=pl,
                                detail="ROAS %.1f vs %.1f elsewhere, %d orders, no modifier" % (ro, ro_other, a["orders"]),
                                action="set %s modifier to +25%%" % pl, dollars=a["sales"], current=0, proposed=25))
            elif mod and a["cost"] >= t["waste_spend_min"] and ro < t["placement_cut_roas"]:
                out.append(dict(rule="placement", severity="medium", campaign=c.get("name"), target=pl,
                                detail="modifier +%d%%, ROAS %.1f, %s spend" % (mod, ro, money(a["cost"])),
                                action="cut %s modifier to 0" % pl, dollars=a["cost"] - a["sales"], current=mod, proposed=0))


def rule_coverage(snap, ix, out):
    # Snapshot is SP only; flag parents with SP sales and remind that SB/SD are not in this pull.
    sales_by_parent = defaultdict(float)
    for r in snap["report_advertised_products"]:
        code = ix.parent_by_asin.get(r.get("advertisedAsin"), r.get("advertisedAsin"))
        sales_by_parent[code] += f(r.get("sales7d"))
    top = sorted(sales_by_parent.items(), key=lambda kv: -kv[1])[:10]
    for code, s in top:
        if s > 0:
            out.append(dict(rule="coverage", severity="info", target=str(code),
                            detail="%s SP sales in window" % money(s),
                            action="confirm Sponsored Brands and Display exist for this parent (not in SP snapshot)", dollars=0))


RULES = [rule_structure, rule_search_terms, rule_targets, rule_budget, rule_placements, rule_coverage]
SEV_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}


# ------------------------------------------------------------------ output
def write_outputs(findings, snap, out_dir, snap_dir):
    os.makedirs(out_dir, exist_ok=True)
    findings.sort(key=lambda x: (SEV_ORDER.get(x["severity"], 9), -abs(x.get("dollars", 0))))
    with open(os.path.join(out_dir, "findings.json"), "w") as fh:
        json.dump(findings, fh, indent=1, ensure_ascii=False)
    cols = ["rule", "severity", "campaign", "adgroup", "target", "current", "proposed", "action", "detail", "dollars"]
    with open(os.path.join(out_dir, "actions.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for x in findings:
            w.writerow({k: x.get(k, "") for k in cols})

    counts = defaultdict(lambda: [0, 0.0])
    for x in findings:
        counts[x["rule"]][0] += 1
        counts[x["rule"]][1] += abs(x.get("dollars", 0))
    m = snap.get("manifest", {})
    lines = ["# Ads audit %s" % dt.date.today().isoformat(), "",
             "Snapshot: `%s` (pulled %s, %s-day reports, profile %s)" % (os.path.basename(snap_dir), m.get("pulled_at", "?"), m.get("days", "?"), m.get("profile_id", "?")), "",
             "Enabled campaigns: %d. Findings: %d." % (sum(1 for c in snap["campaigns"] if c.get("state") == "ENABLED"), len(findings)), "",
             "| Rule | Findings | Dollars in play |", "|---|---:|---:|"]
    for rule, (n, d) in sorted(counts.items(), key=lambda kv: -kv[1][1]):
        lines.append("| %s | %d | %s |" % (rule, n, money(d)))
    lines += ["", "Dollars in play: wasted spend for waste/bleed/pause, attributed sales for scale/harvest/budget.", ""]
    for sev in ("high", "medium", "low"):
        sub = [x for x in findings if x["severity"] == sev]
        if not sub:
            continue
        lines += ["## %s (%d)" % (sev.capitalize(), len(sub)), ""]
        for x in sub[:60]:
            where = " / ".join(s for s in (x.get("campaign"), x.get("adgroup"), x.get("target")) if s)
            lines.append("- **%s** %s. %s. Action: %s." % (x["rule"], where, x["detail"], x["action"]))
        if len(sub) > 60:
            lines.append("- ... %d more in actions.csv" % (len(sub) - 60))
        lines.append("")
    with open(os.path.join(out_dir, "findings.md"), "w") as fh:
        fh.write("\n".join(lines))
    return os.path.join(out_dir, "findings.md")


def run(snap_dir, cfg, out_dir):
    snap = load_snapshot(snap_dir)
    ix = Index(snap, cfg)
    findings = []
    for rule in RULES:
        rule(snap, ix, findings)
    return findings, write_outputs(findings, snap, out_dir, snap_dir)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--snapshot", help="snapshot dir (default: latest under ads/data/snapshots)")
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--out", help="output dir (default ads/data/audits/<today>)")
    args = ap.parse_args(argv)
    with open(args.config) as fh:
        cfg = json.load(fh)
    snap_dir = args.snapshot or latest_snapshot()
    out_dir = args.out or os.path.join(HERE, "data", "audits", dt.date.today().isoformat())
    findings, path = run(snap_dir, cfg, out_dir)
    print("%d findings -> %s" % (len(findings), path))


if __name__ == "__main__":
    main()
