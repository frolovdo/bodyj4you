#!/usr/bin/env python3
"""Score a Sponsored Products snapshot against ads/playbook.md.

Read-only. Input: a directory written by pull_snapshot.py. Output: findings.json,
findings.md and actions.csv under ads/data/audits/<date>/.

Usage:
    python3 audit.py [--snapshot DIR] [--config config.json] [--parents parents.json] [--out DIR]
                     [--parent CODE ...] [--asin ASIN ...] [--min-dollars N]

--parent / --asin restrict findings to campaigns that advertise those parents
or ASINs. Campaigns that also advertise other products are kept and marked
mixed. --min-dollars drops performance findings below that dollar value;
structural findings are always kept.
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


def load_parents(cfg, path):
    """Merge parents.json into cfg['parents']. asins may be a list or {asin: {price, label}}."""
    parents = dict(cfg.get("parents") or {})
    if path and os.path.exists(path):
        with open(path) as fh:
            for code, p in json.load(fh).items():
                if not code.startswith("_"):
                    parents[code] = p
    for code, p in parents.items():
        asins = p.get("asins") or []
        if isinstance(asins, list):
            p["asins"] = {a: {"price": p.get("price"), "label": a} for a in asins}
        else:
            for a, meta in asins.items():
                if isinstance(meta, (int, float)):
                    asins[a] = {"price": float(meta), "label": a}
                else:
                    meta.setdefault("price", p.get("price"))
                    meta.setdefault("label", a)
    cfg["parents"] = parents
    return cfg


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
        # parent and price lookup by ASIN
        self.parent_by_asin, self.price_by_asin = {}, {}
        for code, p in cfg.get("parents", {}).items():
            if code.startswith("_"):
                continue
            for a, meta in (p.get("asins") or {}).items():
                self.parent_by_asin[a] = code
                if meta.get("price"):
                    self.price_by_asin[a] = float(meta["price"])
        # per-ASIN performance from the advertised product report (for ad-group price and parent CVR)
        self.asin_perf = aggregate(snap["report_advertised_products"], lambda r: r.get("advertisedAsin"))
        self.asin_perf_by_ag = aggregate(snap["report_advertised_products"],
                                         lambda r: (str(r.get("adGroupId")), r.get("advertisedAsin")))
        self.parent_perf = aggregate(snap["report_advertised_products"],
                                     lambda r: self.parent_by_asin.get(r.get("advertisedAsin")))
        # scope: campaigns advertising the requested parents/asins; mixed = also advertises others
        self.scope_asins = None
        self.mixed_campaigns = set()
        self.campaign_parents = {}
        for cid in self.camp:
            ps = set()
            for ag in self.ag_by_camp.get(cid, []):
                for pa in self.ads_by_ag.get(str(ag["adGroupId"]), []):
                    if pa.get("state") == "ENABLED":
                        ps.add(self.parent_by_asin.get(pa.get("asin"), pa.get("asin")))
            self.campaign_parents[cid] = ps

    def set_scope(self, parents=None, asins=None):
        """Restrict to campaigns advertising these parents or ASINs. Returns the set of campaign ids in scope."""
        wanted = {a.upper() for a in (asins or [])}
        for code in parents or []:
            wanted.update((self.cfg["parents"].get(code) or {}).get("asins", {}).keys())
        if not wanted:
            return None
        self.scope_asins = wanted
        in_scope = set()
        for cid in self.camp:
            asins_here = {pa.get("asin", "").upper() for ag in self.ag_by_camp.get(cid, [])
                          for pa in self.ads_by_ag.get(str(ag["adGroupId"]), []) if pa.get("state") == "ENABLED"}
            if asins_here & wanted:
                in_scope.add(cid)
                if asins_here - wanted:
                    self.mixed_campaigns.add(cid)
        return in_scope

    def adgroup_price(self, agid):
        """Unit-weighted price of the ASINs advertised in an ad group, from parents.json prices."""
        asins = [pa.get("asin") for pa in self.ads_by_ag.get(str(agid), []) if pa.get("state") == "ENABLED"]
        priced = [(a, self.price_by_asin[a]) for a in asins if a in self.price_by_asin]
        if not priced:
            return None
        weights = {a: max(self.asin_perf_by_ag.get((str(agid), a), {}).get("orders", 0), 0) for a, _ in priced}
        tot = sum(weights.values())
        if tot:
            return sum(p * weights[a] for a, p in priced) / tot
        return sum(p for _, p in priced) / len(priced)

    def parent_cvr(self, cid):
        """Parent-level conversion rate from the advertised product report, or None."""
        for code in self.campaign_parents.get(cid, set()):
            perf = self.parent_perf.get(code)
            if perf and perf["clicks"] >= self.t["min_clicks_for_own_cvr"]:
                return perf["orders"] / perf["clicks"]
        return None

    def allowable_cpo(self, cid, agid):
        """Ad dollars one order may cost: price x target ACoS. None without a price."""
        price = self.adgroup_price(agid)
        return price * self.target_acos_for_campaign(cid) if price else None

    def clicks_for_no_sale(self, cid, confidence):
        """Clicks after which zero orders is unlikely at the parent's CVR: ceil(ln(1-conf) / ln(1-cvr))."""
        cvr = self.parent_cvr(cid)
        if not cvr or cvr >= 1:
            return None
        return int(math.ceil(math.log(1 - confidence) / math.log(1 - cvr)))

    def no_sale_benchmark(self, cid, agid, confidence, lost_orders):
        """(min_clicks, min_spend, note) for calling a zero-order target wasteful. None values mean fall back to flat thresholds."""
        clicks = self.clicks_for_no_sale(cid, confidence)
        cpo = self.allowable_cpo(cid, agid)
        if clicks is None or cpo is None:
            return None, None, "flat benchmark (no parent price or CVR)"
        spend = round(cpo * lost_orders, 2)
        note = "benchmark %d clicks and %s (CVR %.1f%%, %s allowed per order)" % (
            clicks, money(spend), 100 * self.parent_cvr(cid), money(cpo))
        return clicks, spend, note

    def starting_bid(self, cid, agid):
        """Playbook section 3: price x parent CVR x target ACoS, when the target has no usable history."""
        price, cvr = self.adgroup_price(agid), self.parent_cvr(cid)
        if price and cvr:
            return round(price * cvr * self.target_acos_for_campaign(cid), 2)
        return None

    def is_negated(self, camp_id, ag_id, term):
        term = term.lower()
        for scope in (str(ag_id), None):
            if (camp_id, scope, term, "NEGATIVE_EXACT") in self.negs:
                return True
            for (c, s, text, mt) in self.negs:
                if c == camp_id and s == scope and mt == "NEGATIVE_PHRASE" and text in term:
                    return True
        return False

    def target_acos_for_parent(self, code):
        """Parent's own target, else the default for its stage, else the account default."""
        p = self.cfg["parents"].get(code) or {}
        if p.get("target_acos"):
            return p["target_acos"]
        by_stage = self.cfg["account"].get("stage_default_target_acos", {})
        if p.get("stage") in by_stage:
            return by_stage[p["stage"]]
        return self.cfg["account"]["default_target_acos"]

    def target_acos_for_campaign(self, camp_id):
        asins = {p.get("asin") for ag in self.ag_by_camp.get(camp_id, []) for p in self.ads_by_ag.get(str(ag["adGroupId"]), [])}
        for a in asins:
            code = self.parent_by_asin.get(a)
            if code:
                return self.target_acos_for_parent(code)
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
        min_clicks, min_spend, note = ix.no_sale_benchmark(cid, agid, t["waste_confidence"], t["waste_lost_orders"])
        if min_clicks is None:
            wasteful = a["cost"] >= t["waste_spend_min"]
        else:
            wasteful = a["clicks"] >= min_clicks and a["cost"] >= min_spend
        if wasteful and a["orders"] == 0 and not ix.is_negated(cid, agid, term):
            is_asin_term = term.startswith("b0") and len(term) == 10
            out.append(dict(rule="waste", severity="high", campaign=cname, adgroup=r.get("adGroupName"),
                            target=term.upper() if is_asin_term else term,
                            detail="%s spend, %d clicks, 0 orders; %s" % (money(a["cost"]), a["clicks"], note),
                            action="add negative product target in this campaign" if is_asin_term else "add negative exact in this campaign",
                            dollars=a["cost"]))
        # harvest
        is_asin = term.startswith("b0") and len(term) == 10
        already = term in ix.exact_texts
        ok = a["orders"] >= t["harvest_min_orders"] or (t.get("harvest_allow_one_order") and a["orders"] == 1
                                                         and acos(a["cost"], a["sales"]) <= tgt * t["harvest_one_order_max_acos_ratio"])
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
        p_clicks, p_spend, p_note = ix.no_sale_benchmark(cid, agid, t["pause_confidence"], t["waste_lost_orders"])
        pause_now = (a["clicks"] >= p_clicks and a["cost"] >= p_spend) if p_clicks else a["clicks"] >= t["pause_min_clicks"]
        if pause_now and a["orders"] == 0:
            out.append(dict(rule="pause", severity="high", campaign=cname, adgroup=r.get("adGroupName"), target=label,
                            detail="%d clicks, %s spend, 0 orders; %s" % (a["clicks"], money(a["cost"]), p_note),
                            action="pause target", dollars=a["cost"]))
        elif a["cost"] >= t["waste_spend_min"] and (a["orders"] == 0 or ac > t["bleed_acos"] or ro < t["bleed_roas"]):
            # small steps per playbook: one step down, never below the formula bid in one move
            stepped = round(max(bid - t["bid_step_down"], 0.02), 2)
            ref_bid = formula_bid or ix.starting_bid(cid, agid)
            new_bid = max(stepped, ref_bid) if ref_bid else stepped
            target_note = (", formula bid %s" % money(ref_bid)) if ref_bid else ""
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
            ref_bid = ix.starting_bid(cid, agid)
            new_bid = round(bid + t["bid_step_up"], 2)
            if ref_bid and ref_bid > new_bid:
                new_bid = round(min(ref_bid, bid + 2 * t["bid_step_up"]), 2)
            out.append(dict(rule="zombie", severity="low", campaign=cname, adgroup=r.get("adGroupName"), target=label,
                            detail="%d impressions in window, bid %s%s" % (a["impressions"], money(bid), (", formula bid %s" % money(ref_bid)) if ref_bid else ""),
                            action="second chance: raise bid to %s, remove only if still no impressions next window" % money(new_bid),
                            dollars=0, current=bid, proposed=new_bid))


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
            out.append(dict(rule="budget-hold", severity="medium", campaign=c.get("name", cid),
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
                out.append(dict(rule="placement-cut", severity="medium", campaign=c.get("name"), target=pl,
                                detail="modifier +%d%%, ROAS %.1f, %s spend" % (mod, ro, money(a["cost"])),
                                action="cut %s modifier to 0" % pl, dollars=a["cost"] - a["sales"], current=mod, proposed=0))


def rule_portfolio(snap, ix, out):
    """One portfolio per parent [T]."""
    parents_in_portfolio = defaultdict(set)
    for cid, c in ix.camp.items():
        if c.get("state") != "ENABLED":
            continue
        pid = c.get("portfolioId")
        if not pid:
            out.append(dict(rule="portfolio", severity="low", campaign=c["name"],
                            detail="campaign is not in a portfolio", action="move into the parent's portfolio", dollars=0))
            continue
        for ag in ix.ag_by_camp.get(cid, []):
            for pa in ix.ads_by_ag.get(str(ag["adGroupId"]), []):
                if pa.get("state") == "ENABLED":
                    parents_in_portfolio[str(pid)].add(ix.parent_by_asin.get(pa.get("asin"), pa.get("asin")))
    names = {str(p["portfolioId"]): p.get("name", str(p["portfolioId"])) for p in snap["portfolios"]}
    for pid, parents in parents_in_portfolio.items():
        if len(parents) > 1:
            out.append(dict(rule="portfolio", severity="low", target=names.get(pid, pid),
                            detail="portfolio holds %d parents: %s" % (len(parents), ", ".join(sorted(map(str, parents)))[:200]),
                            action="one portfolio per parent", dollars=0))


def rule_branded(snap, ix, out):
    """Branded keywords in their own campaigns [T]."""
    terms = [b.lower() for b in ix.cfg["account"].get("brand_terms", [])]
    if not terms:
        return
    for cid, c in ix.camp.items():
        if c.get("state") != "ENABLED":
            continue
        kws = [k for ag in ix.ag_by_camp.get(cid, []) for k in ix.kw_by_ag.get(str(ag["adGroupId"]), []) if k.get("state") == "ENABLED"]
        branded = [k["keywordText"] for k in kws if any(b in k["keywordText"].lower().replace("-", " ") for b in terms)]
        if branded and len(branded) < len(kws):
            out.append(dict(rule="branded", severity="medium", campaign=c["name"],
                            detail="%d branded of %d keywords: %s" % (len(branded), len(kws), ", ".join(branded[:5])),
                            action="move branded keywords to a BRAND campaign", dollars=0))


def rule_listing_signal(snap, ix, out):
    """CTR/CVR read per parent [T]: high CTR low CVR = PDP problem; low CTR high CVR = attention problem."""
    agg = aggregate(snap["report_advertised_products"], lambda r: ix.parent_by_asin.get(r.get("advertisedAsin"), r.get("advertisedAsin")))
    rows = [(k, a) for k, a in agg.items() if a["clicks"] >= 100]
    if len(rows) < 2:
        return
    ctrs = sorted(a["clicks"] / a["impressions"] for _, a in rows if a["impressions"])
    cvrs = sorted(a["orders"] / a["clicks"] for _, a in rows)
    med_ctr, med_cvr = ctrs[len(ctrs) // 2], cvrs[len(cvrs) // 2]
    for k, a in rows:
        ctr = a["clicks"] / a["impressions"] if a["impressions"] else 0
        cvr = a["orders"] / a["clicks"]
        if ctr >= med_ctr and cvr < 0.5 * med_cvr:
            out.append(dict(rule="listing", severity="info", target=str(k),
                            detail="CTR %.2f%% (median %.2f%%), CVR %.1f%% (median %.1f%%)" % (100 * ctr, 100 * med_ctr, 100 * cvr, 100 * med_cvr),
                            action="detail page is not converting: price, bullets, A+, reviews", dollars=0))
        elif ctr < 0.5 * med_ctr and cvr >= med_cvr:
            out.append(dict(rule="listing", severity="info", target=str(k),
                            detail="CTR %.2f%% (median %.2f%%), CVR %.1f%% (median %.1f%%)" % (100 * ctr, 100 * med_ctr, 100 * cvr, 100 * med_cvr),
                            action="listing not getting attention: main image, title, price, rating", dollars=0))


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


RULES = [rule_structure, rule_portfolio, rule_branded, rule_search_terms, rule_targets, rule_budget, rule_placements, rule_coverage, rule_listing_signal]

# Playbook section 4: one phase per product. Structural rules apply always.
PHASE_OF_RULE = {
    # "always": removing something that spends money with no sales is actioned in either phase (Denis's call,
    # overriding Trivium's placement of negation in profitability mode).
    "waste": "always", "pause": "always", "bleed": "profitability",
    "never-negated": "profitability", "budget-hold": "profitability", "placement-cut": "profitability",
    "scale": "performance", "harvest": "performance", "budget": "performance",
    "placement": "performance", "zombie": "performance",
}
SEV_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}


# ------------------------------------------------------------------ output
def write_outputs(findings, snap, out_dir, snap_dir, scope_note=None):
    os.makedirs(out_dir, exist_ok=True)
    findings.sort(key=lambda x: (SEV_ORDER.get(x["severity"], 9), -abs(x.get("dollars", 0))))
    with open(os.path.join(out_dir, "findings.json"), "w") as fh:
        json.dump(findings, fh, indent=1, ensure_ascii=False)
    cols = ["rule", "severity", "phase", "deferred", "parent", "mixed", "campaign", "adgroup", "target", "current", "proposed", "action", "detail", "dollars"]
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
             ] + ([scope_note, ""] if scope_note else []) + [
             "| Rule | Findings | Dollars in play |", "|---|---:|---:|"]
    for rule, (n, d) in sorted(counts.items(), key=lambda kv: -kv[1][1]):
        lines.append("| %s | %d | %s |" % (rule, n, money(d)))
    lines += ["", "Dollars in play: wasted spend for waste/bleed/pause, attributed sales for scale/harvest/budget.", ""]
    deferred = [x for x in findings if x.get("deferred")]
    if deferred:
        lines += ["%d findings are deferred because the parent is in the other optimization phase (playbook section 4). They are listed at the end." % len(deferred), ""]
    for sev in ("high", "medium", "low"):
        sub = [x for x in findings if x["severity"] == sev and not x.get("deferred")]
        if not sub:
            continue
        lines += ["## %s (%d)" % (sev.capitalize(), len(sub)), ""]
        for x in sub[:60]:
            where = " / ".join(s for s in (x.get("campaign"), x.get("adgroup"), x.get("target")) if s)
            mixed = " (mixed campaign)" if x.get("mixed") else ""
            lines.append("- **%s** %s%s. %s. Action: %s." % (x["rule"], where, mixed, x["detail"], x["action"]))
        if len(sub) > 60:
            lines.append("- ... %d more in actions.csv" % (len(sub) - 60))
        lines.append("")
    if deferred:
        lines += ["## Deferred (%d)" % len(deferred), ""]
        for x in deferred[:60]:
            where = " / ".join(s for s in (x.get("campaign"), x.get("adgroup"), x.get("target")) if s)
            lines.append("- **%s** [%s phase, parent %s] %s. %s. Action: %s." % (x["rule"], x["phase"], x["parent"], where, x["detail"], x["action"]))
        lines.append("")
    with open(os.path.join(out_dir, "findings.md"), "w") as fh:
        fh.write("\n".join(lines))
    return os.path.join(out_dir, "findings.md")


def tag_phases(findings, ix):
    """Attach phase and parent to each finding; mark deferred when outside the parent's phase."""
    stage_phase = ix.cfg["account"].get("stage_phase", {})
    name_to_id = {c["name"]: cid for cid, c in ix.camp.items()}
    for x in findings:
        x["phase"] = PHASE_OF_RULE.get(x["rule"], "structural")
        cid = name_to_id.get(x.get("campaign"))
        parent = None
        if cid:
            for ag in ix.ag_by_camp.get(cid, []):
                for pa in ix.ads_by_ag.get(str(ag["adGroupId"]), []):
                    parent = ix.parent_by_asin.get(pa.get("asin"))
                    if parent:
                        break
                if parent:
                    break
        x["parent"] = parent or ""
        stage = ix.cfg.get("parents", {}).get(parent, {}).get("stage") if parent else None
        active = stage_phase.get(stage) if stage else None
        x["deferred"] = bool(active and x["phase"] not in ("structural", "info", "always", active))
    return findings


def run(snap_dir, cfg, out_dir, parents=None, asins=None, min_dollars=None):
    snap = load_snapshot(snap_dir)
    ix = Index(snap, cfg)
    in_scope = ix.set_scope(parents, asins)
    findings = []
    for rule in RULES:
        rule(snap, ix, findings)
    tag_phases(findings, ix)
    name_to_id = {c["name"]: cid for cid, c in ix.camp.items()}
    if in_scope is not None:
        kept = []
        for x in findings:
            cid = name_to_id.get(x.get("campaign"))
            if cid is None:
                # account-level finding (overlap, portfolio by name, coverage, listing): keep if it names a scoped parent/asin
                txt = " ".join(str(x.get(k, "")) for k in ("target", "detail", "parent")).upper()
                if any(a in txt for a in ix.scope_asins) or any(p in txt for p in (parents or [])):
                    kept.append(x)
                continue
            if cid in in_scope:
                x["mixed"] = cid in ix.mixed_campaigns
                kept.append(x)
        findings = kept
    md = t_min = (min_dollars if min_dollars is not None else cfg["thresholds"].get("min_finding_dollars", 0)) or 0
    if md:
        findings = [x for x in findings if x.get("phase") in ("structural", "info") or abs(x.get("dollars", 0)) >= md]
    scope_note = None
    if in_scope is not None:
        scope_note = "Scope: %s. %d campaigns in scope, %d of them mixed with other products." % (
            ", ".join((parents or []) + (asins or [])), len(in_scope), len(ix.mixed_campaigns))
    return findings, write_outputs(findings, snap, out_dir, snap_dir, scope_note)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--snapshot", help="snapshot dir (default: latest under ads/data/snapshots)")
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--parents", default=os.path.join(HERE, "parents.json"), help="parents file (gitignored; see parents.example.json)")
    ap.add_argument("--out", help="output dir (default ads/data/audits/<today>)")
    ap.add_argument("--parent", nargs="+", metavar="CODE", help="restrict to these parent codes from parents.json")
    ap.add_argument("--asin", nargs="+", metavar="ASIN", help="restrict to campaigns advertising these ASINs")
    ap.add_argument("--min-dollars", type=float, help="drop performance findings under this dollar value")
    args = ap.parse_args(argv)
    with open(args.config) as fh:
        cfg = json.load(fh)
    load_parents(cfg, args.parents)
    if not cfg["parents"]:
        sys.stderr.write("note: no parents configured (%s missing). Bid formulas fall back to each target's own data.\n" % args.parents)
    snap_dir = args.snapshot or latest_snapshot()
    out_dir = args.out or os.path.join(HERE, "data", "audits", dt.date.today().isoformat())
    findings, path = run(snap_dir, cfg, out_dir, parents=args.parent, asins=args.asin, min_dollars=args.min_dollars)
    print("%d findings -> %s" % (len(findings), path))


if __name__ == "__main__":
    main()
