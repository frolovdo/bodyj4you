#!/usr/bin/env python3
"""
Amazon Best Seller Badge Daily Tracker
Run daily via scheduled Claude Code routine or directly:
  python3 amazon-tracker/check_bestseller.py

Required env vars for email sending:
  GMAIL_USER          - sender Gmail address (e.g. frolovdo@gmail.com)
  GMAIL_APP_PASSWORD  - Gmail App Password (not your login password)
                        Create at: https://myaccount.google.com/apppasswords

Network requirement: www.amazon.com must be in the egress allowlist of the
Claude Code remote environment (Settings > Network).
"""

import json
import os
import re
import smtplib
import ssl
import sys
import time
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PRODUCTS = [
    {
        "name": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1",
    },
    {
        "name": "PN10-Master",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
    },
    {
        "name": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
    },
]

EMAIL_TO = "denis@bodyj4you.com"
GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

HISTORY_FILE = Path(__file__).parent / "history.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}


# ---------------------------------------------------------------------------
# Badge detection
# ---------------------------------------------------------------------------

# Patterns that confirm a Best Seller badge (not just a review mentioning it)
_BADGE_PATTERNS = [
    r'#1\s+Best\s+Seller',
    r'Best\s+Seller\s+in\b',
    r'bestSellerBadge',
    r'best-seller-badge',
    r'id=["\']bestseller',
    r'class=["\'][^"\']*best.?seller',
    r'Best Seller\s*<',
    r'<[^>]*>Best Seller<',
    r'"isBestSeller"\s*:\s*true',
    r'Best\s+Seller\s+rank',
]

_BADGE_RE = re.compile("|".join(_BADGE_PATTERNS), re.IGNORECASE)


def check_best_seller(product: dict, session: requests.Session) -> str:
    """Return YES, NO, or an ERROR string."""
    url = product["url"]
    try:
        resp = session.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
    except requests.exceptions.ConnectionError as e:
        if "allowlist" in str(e).lower() or "not in allowlist" in str(e).lower():
            return "ERROR: amazon.com not in network egress allowlist"
        return f"ERROR: connection failed — {e}"
    except Exception as e:
        return f"ERROR: {e}"

    if resp.status_code == 403:
        body = resp.text[:300]
        if "not in allowlist" in body or "egress" in body.lower():
            return "ERROR: www.amazon.com blocked — add to network egress allowlist"
        return "ERROR: Amazon returned 403 (bot block)"
    if resp.status_code == 503:
        return "ERROR: Amazon returned 503 (service unavailable / CAPTCHA)"
    if resp.status_code != 200:
        return f"ERROR: HTTP {resp.status_code}"

    html = resp.text

    # Guard: CAPTCHA page
    if "Enter the characters you see below" in html or "robot check" in html.lower():
        return "ERROR: Amazon CAPTCHA triggered"

    if _BADGE_RE.search(html):
        return "YES"
    return "NO"


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def load_history() -> list:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return []


def save_history(history: list) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

_STATUS_COLORS = {
    "YES": "#d4edda",   # green
    "NO": "#f8d7da",    # red
}


def _row_color(status: str) -> str:
    return _STATUS_COLORS.get(status, "#fff3cd")   # yellow for errors


def build_html(today: str, results: list, history: list) -> str:
    today_rows = "".join(
        f'<tr style="background:{_row_color(r["best_seller"])};">'
        f'<td><a href="{r["url"]}">{r["name"]}</a></td>'
        f"<td>{today}</td>"
        f'<td><strong>{r["best_seller"]}</strong></td>'
        f"</tr>"
        for r in results
    )

    # Last 14 days of history (newest first)
    history_rows = ""
    for entry in reversed(history[-14:]):
        for r in entry.get("results", []):
            history_rows += (
                f'<tr style="background:{_row_color(r["best_seller"])};">'
                f'<td><a href="{r["url"]}">{r["name"]}</a></td>'
                f'<td>{entry["date"]}</td>'
                f'<td>{r["best_seller"]}</td>'
                f"</tr>"
            )

    th = 'style="background:#343a40;color:white;padding:8px;text-align:left;"'
    td_style = 'cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;width:100%;"'

    return f"""
<html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;">
<h2 style="color:#343a40;">Amazon Best Seller Badge Report &mdash; {today}</h2>

<h3>Today&rsquo;s Results</h3>
<table border="1" {td_style}>
  <tr><th {th}>Product</th><th {th}>Date</th><th {th}>Best Seller?</th></tr>
  {today_rows}
</table>

<br>
<h3>History (last 14 days)</h3>
<table border="1" {td_style}>
  <tr><th {th}>Product</th><th {th}>Date</th><th {th}>Best Seller?</th></tr>
  {history_rows}
</table>
</body></html>
"""


def send_email(today: str, results: list, history: list) -> None:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print(
            "WARNING: GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email.\n"
            "Set these in your scheduled routine's environment variables.",
            file=sys.stderr,
        )
        return

    html = build_html(today, results, history)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Amazon Best Seller Check — {today}"
    msg["From"] = GMAIL_USER
    msg["To"] = EMAIL_TO
    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_USER, EMAIL_TO, msg.as_string())

    print(f"Email sent to {EMAIL_TO}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    today = str(date.today())
    session = requests.Session()
    results = []

    for i, product in enumerate(PRODUCTS):
        if i > 0:
            time.sleep(2)   # polite delay between requests
        status = check_best_seller(product, session)
        results.append({"name": product["name"], "url": product["url"], "best_seller": status})
        print(f"  {product['name']:25s}  →  {status}")

    # Persist history
    history = load_history()
    history.append({"date": today, "results": results})
    save_history(history)
    print(f"History saved to {HISTORY_FILE}")

    send_email(today, results, history)


if __name__ == "__main__":
    print(f"Checking {len(PRODUCTS)} Amazon listings …")
    main()
