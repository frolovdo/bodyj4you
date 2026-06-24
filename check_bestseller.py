#!/usr/bin/env python3
"""
Daily Amazon Best Seller badge checker.
Checks configured listings and updates history JSON.
"""

import json
import os
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HISTORY_FILE = Path(__file__).parent / "bestseller_history.json"

PRODUCTS = [
    {
        "name": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1",
        "asin": "B08L8VZHKR",
    },
    {
        "name": "PN10-Master",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
        "asin": "B004MZMBC4",
    },
    {
        "name": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
        "asin": "B0785J3B94",
    },
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
}


def has_best_seller_badge(html: str) -> bool:
    """Return True if the Amazon page HTML contains a Best Seller badge."""
    soup = BeautifulSoup(html, "lxml")

    # Pattern 1: badge icon or label
    for tag in soup.find_all(string=re.compile(r"#?1?\s*Best\s*Seller", re.I)):
        return True

    # Pattern 2: bestseller rank section in product details
    for tag in soup.find_all("span", string=re.compile(r"Best Sellers Rank", re.I)):
        return True

    # Pattern 3: badge elements
    for badge in soup.find_all(class_=re.compile(r"bestseller|best-seller|a-icon-bestseller", re.I)):
        return True

    # Pattern 4: raw text scan for speed
    patterns = [
        "#1 Best Seller",
        "Best Seller in",
        "a-icon-bestseller",
        "best-seller-badge",
        "bestSellerBadge",
        "Best Sellers Rank",
    ]
    for pattern in patterns:
        if pattern.lower() in html.lower():
            return True

    return False


def check_product(product: dict, session: requests.Session) -> dict:
    """Fetch one Amazon listing and return its Best Seller status."""
    url = product["url"]
    name = product["name"]
    asin = product["asin"]

    try:
        resp = session.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()

        if "robot" in resp.text.lower() or "captcha" in resp.text.lower():
            status = "BLOCKED"
            badge = False
        else:
            badge = has_best_seller_badge(resp.text)
            status = "YES" if badge else "NO"

    except requests.RequestException as exc:
        print(f"  ERROR fetching {name}: {exc}", file=sys.stderr)
        status = "ERROR"
        badge = False

    return {
        "name": name,
        "asin": asin,
        "url": url,
        "best_seller": badge,
        "status": status,
    }


def load_history() -> list:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return []


def save_history(history: list) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def run_checks() -> list:
    today = date.today().isoformat()
    results = []

    session = requests.Session()
    # Warm up session with Amazon homepage
    try:
        session.get("https://www.amazon.com", headers=HEADERS, timeout=15)
        time.sleep(2)
    except Exception:
        pass

    for product in PRODUCTS:
        print(f"Checking {product['name']} ({product['asin']})...")
        result = check_product(product, session)
        result["date"] = today
        results.append(result)
        print(f"  → Best Seller: {result['status']}")
        time.sleep(3)  # polite delay between requests

    return results


def build_email_html(today: str, results: list, history: list) -> str:
    rows = ""
    for r in results:
        badge = r["status"]
        color = "#2ecc71" if badge == "YES" else ("#e74c3c" if badge == "NO" else "#f39c12")
        badge_cell = f'<td style="color:{color};font-weight:bold;text-align:center">{badge}</td>'
        name_link = f'<a href="{r["url"]}" style="color:#2980b9">{r["name"]}</a>'
        rows += f"<tr><td>{name_link}</td><td style='text-align:center'>{today}</td>{badge_cell}</tr>\n"

    # History table (last 14 days)
    history_rows = ""
    seen = {}
    for entry in reversed(history[-42:]):  # up to 14 days × 3 products
        key = (entry["date"], entry["name"])
        if key not in seen:
            seen[key] = entry
    for entry in sorted(seen.values(), key=lambda x: (x["date"], x["name"]), reverse=True):
        badge = entry["status"]
        color = "#2ecc71" if badge == "YES" else ("#e74c3c" if badge == "NO" else "#f39c12")
        history_rows += (
            f"<tr><td>{entry['name']}</td>"
            f"<td style='text-align:center'>{entry['date']}</td>"
            f"<td style='color:{color};font-weight:bold;text-align:center'>{badge}</td></tr>\n"
        )

    return f"""
<html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px">
<h2 style="color:#2c3e50">Amazon Best Seller Badge Report — {today}</h2>

<h3 style="color:#34495e">Today's Results</h3>
<table border="0" cellpadding="8" cellspacing="0"
  style="border-collapse:collapse;width:100%;background:#f8f9fa">
  <thead style="background:#2c3e50;color:#fff">
    <tr><th style="text-align:left">Product</th>
        <th>Date</th>
        <th>Best Seller?</th></tr>
  </thead>
  <tbody>
{rows}
  </tbody>
</table>

<h3 style="color:#34495e;margin-top:30px">Recent History</h3>
<table border="0" cellpadding="6" cellspacing="0"
  style="border-collapse:collapse;width:100%;background:#f8f9fa;font-size:13px">
  <thead style="background:#7f8c8d;color:#fff">
    <tr><th style="text-align:left">Product</th>
        <th>Date</th>
        <th>Best Seller?</th></tr>
  </thead>
  <tbody>
{history_rows}
  </tbody>
</table>

<p style="color:#95a5a6;font-size:12px;margin-top:20px">
  Automated daily check via GitHub Actions.
</p>
</body></html>
"""


def build_email_plain(today: str, results: list) -> str:
    lines = [f"Amazon Best Seller Badge Report — {today}", ""]
    for r in results:
        lines.append(f"{r['name']}: {r['status']}")
        lines.append(f"  {r['url']}")
    return "\n".join(lines)


def main():
    print(f"Running Best Seller check for {date.today().isoformat()}...")

    history = load_history()
    results = run_checks()

    # Append to history
    history.extend(results)
    save_history(history)

    today = date.today().isoformat()
    html = build_email_html(today, results, history)
    plain = build_email_plain(today, results)

    # Write email content to files for GitHub Actions to pick up
    Path("email_body.html").write_text(html)
    Path("email_body.txt").write_text(plain)

    # Print summary for logs
    print("\n=== SUMMARY ===")
    for r in results:
        print(f"  {r['name']}: {r['status']}")

    return results


if __name__ == "__main__":
    main()
