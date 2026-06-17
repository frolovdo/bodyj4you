#!/usr/bin/env python3
"""
Daily Amazon Best Seller badge checker.
Fetches each listing, detects the badge, saves history, and emails results.
"""

import json
import os
import re
import smtplib
import sys
import time
from datetime import date, datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests

PRODUCTS = [
    {
        "name": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1",
    },
    {
        "name": "PN10-Maste",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
    },
    {
        "name": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
    },
]

HISTORY_FILE = Path(__file__).parent / "bestseller_history.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}

# Patterns that specifically indicate the #1 Best Seller badge
# (NOT "Best Sellers Rank" which appears on every product)
BADGE_PATTERNS = [
    r"#1\s+Best\s+Seller",
    r'"isBestseller"\s*:\s*true',
    r"bestseller-badge-ribbon",
    r"best-seller-badge",
    r'class="[^"]*bestseller[^"]*"',
    r"p13n-sc-icon-bestseller",
    r"Best Seller</span>",
    r"Best Seller</a>",
    r'Best Seller[^s].*?ribbon',
]


def load_history() -> dict:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {}


def save_history(history: dict) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2, sort_keys=True)


def _has_badge(html: str) -> bool:
    for pattern in BADGE_PATTERNS:
        if re.search(pattern, html, re.IGNORECASE):
            return True
    return False


def check_product(product: dict, session: requests.Session) -> str:
    url = product["url"]
    try:
        resp = session.get(url, headers=HEADERS, timeout=30, allow_redirects=True)
        if resp.status_code == 200:
            return "yes" if _has_badge(resp.text) else "no"
        print(f"  HTTP {resp.status_code} for {product['name']}", file=sys.stderr)
        return "error"
    except Exception as exc:
        print(f"  Request failed for {product['name']}: {exc}", file=sys.stderr)
        return "error"


def _status_icon(status: str) -> str:
    return {"yes": "✅ YES", "no": "❌ NO", "error": "⚠️ ERROR"}.get(status, status)


def build_email_html(today: str, results: dict, history: dict) -> str:
    rows = ""
    for p in PRODUCTS:
        name = p["name"]
        url = p["url"]
        status = results.get(name, "error")
        icon = _status_icon(status)
        product_hist = history.get(name, {})
        recent = sorted(product_hist.items(), reverse=True)[:10]
        hist_cells = "".join(
            f'<td style="text-align:center;padding:4px 6px;font-size:12px">'
            f'{d}<br>{"✅" if v=="yes" else ("❌" if v=="no" else "⚠️")}</td>'
            for d, v in recent
        )
        badge_color = "#d4edda" if status == "yes" else ("#f8d7da" if status == "no" else "#fff3cd")
        rows += f"""
        <tr>
          <td style="padding:10px 12px">
            <a href="{url}" style="color:#0066c0;font-weight:bold">{name}</a>
          </td>
          <td style="padding:10px 12px;text-align:center;background:{badge_color};font-size:15px;font-weight:bold">
            {icon}
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:4px 12px 14px">
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr style="color:#555">{hist_cells}</tr>
            </table>
          </td>
        </tr>
        """

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:820px;margin:0 auto;color:#111">
  <div style="background:#232F3E;padding:16px 24px">
    <span style="color:#FF9900;font-size:20px;font-weight:bold">Amazon</span>
    <span style="color:#fff;font-size:18px"> Best Seller Badge Report</span>
  </div>
  <div style="padding:16px 24px">
    <p style="margin:0 0 16px;color:#555">Check date: <strong>{today}</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;border:1px solid #ddd">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #ddd">Product</th>
          <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #ddd">Best Seller Today?</th>
        </tr>
      </thead>
      <tbody>
        {rows}
      </tbody>
    </table>
    <p style="margin-top:24px;font-size:12px;color:#999">
      Automated daily check · history stored in frolovdo/bodyj4you
    </p>
  </div>
</body>
</html>"""


def send_email(today: str, results: dict, history: dict) -> None:
    gmail_user = os.environ["GMAIL_USER"]
    gmail_password = os.environ["GMAIL_APP_PASSWORD"]
    recipient = os.environ.get("RECIPIENT_EMAIL", "denis@bodyj4you.com")

    summary_lines = [f"{p['name']}: {results.get(p['name'], 'error').upper()}" for p in PRODUCTS]
    summary = " | ".join(summary_lines)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Amazon Best Seller Report {today} — {summary}"
    msg["From"] = gmail_user
    msg["To"] = recipient
    msg.attach(MIMEText(build_email_html(today, results, history), "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, recipient, msg.as_string())
    print(f"Email sent → {recipient}")


def main() -> int:
    today = date.today().isoformat()
    print(f"=== Amazon Best Seller Check — {today} ===")

    history = load_history()
    results = {}

    session = requests.Session()

    for product in PRODUCTS:
        print(f"Checking {product['name']} …", end=" ", flush=True)
        time.sleep(2)
        status = check_product(product, session)
        print(status.upper())
        results[product["name"]] = status
        history.setdefault(product["name"], {})[today] = status

    save_history(history)
    print("History saved.")

    if os.environ.get("GMAIL_USER") and os.environ.get("GMAIL_APP_PASSWORD"):
        send_email(today, results, history)
    else:
        print("GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email.")
        for name, status in results.items():
            print(f"  {name}: {status}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
