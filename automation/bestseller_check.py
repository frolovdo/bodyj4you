#!/usr/bin/env python3
"""
Daily Amazon Best Seller badge checker.
Checks 3 product listings, updates history JSON, and emails results.

Required env vars:
  GMAIL_SENDER_EMAIL  - Gmail address used to send (must match App Password)
  GMAIL_APP_PASSWORD  - Gmail App Password (https://myaccount.google.com/apppasswords)
  RECIPIENT_EMAIL     - Where to send the daily report
"""

import json
import os
import re
import smtplib
import time
import random
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Product configuration
# ---------------------------------------------------------------------------
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

HISTORY_FILE = Path(__file__).parent.parent / "data" / "bestseller_history.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]


def get_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
        "DNT": "1",
    }


def has_best_seller_badge(html: str) -> bool:
    """
    Returns True if the page contains an Amazon Best Seller badge.
    Checks multiple DOM patterns Amazon uses.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Pattern 1: badge ribbon text elements
    for tag in soup.find_all(class_=re.compile(r"badge|ribbon|bestsell", re.I)):
        if "best seller" in tag.get_text(separator=" ").lower():
            return True

    # Pattern 2: a-badge-text (Amazon's badge component)
    for tag in soup.find_all(class_="a-badge-text"):
        if "best seller" in tag.get_text().lower():
            return True

    # Pattern 3: bestsellernew-badge or similar IDs/classes
    for tag in soup.find_all(id=re.compile(r"bestsell", re.I)):
        return True

    # Pattern 4: raw text fallback — "#1 Best Seller" or "Best Seller in"
    page_text = soup.get_text(separator=" ").lower()
    if "#1 best seller" in page_text or "best seller in" in page_text:
        return True

    return False


def check_product(product: dict) -> dict:
    """Fetch a product page and return a result dict."""
    try:
        session = requests.Session()
        # Warm up with homepage first to get cookies
        session.get("https://www.amazon.com", headers=get_headers(), timeout=15)
        time.sleep(random.uniform(2, 5))

        response = session.get(product["url"], headers=get_headers(), timeout=20)
        response.raise_for_status()

        badge = has_best_seller_badge(response.text)
        return {
            "name": product["name"],
            "url": product["url"],
            "asin": product["asin"],
            "best_seller": badge,
            "status": "yes" if badge else "no",
            "error": None,
        }
    except Exception as exc:
        print(f"  ERROR checking {product['name']}: {exc}")
        return {
            "name": product["name"],
            "url": product["url"],
            "asin": product["asin"],
            "best_seller": None,
            "status": "error",
            "error": str(exc),
        }


def load_history() -> dict:
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text())
    return {}


def save_history(history: dict):
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2))


def build_email_html(date_str: str, results: list, history: dict) -> str:
    rows = ""
    for r in results:
        badge_cell = (
            '<td style="color:#1a7a1a;font-weight:bold;">✅ YES</td>'
            if r["status"] == "yes"
            else '<td style="color:#cc0000;font-weight:bold;">❌ NO</td>'
            if r["status"] == "no"
            else '<td style="color:#888;">⚠️ ERROR</td>'
        )
        link = f'<a href="{r["url"]}" style="color:#0066c0;text-decoration:none;">{r["name"]}</a>'

        # Build 7-day trend from history
        trend_cells = ""
        past_dates = sorted(history.keys())[-7:]
        for d in past_dates:
            day_data = {e["name"]: e["status"] for e in history[d]}
            s = day_data.get(r["name"], "-")
            color = "#1a7a1a" if s == "yes" else "#cc0000" if s == "no" else "#aaa"
            short = d[5:]  # MM-DD
            trend_cells += f'<td style="font-size:11px;color:{color};text-align:center;">{short}<br>{"✅" if s=="yes" else "❌" if s=="no" else "—"}</td>'

        rows += f"""
        <tr style="border-bottom:1px solid #e0e0e0;">
          <td style="padding:10px 8px;">{link}</td>
          {badge_cell}
          {trend_cells}
        </tr>"""

    trend_header = "".join(
        f'<th style="font-size:11px;color:#666;padding:6px 4px;">{d[5:]}</th>'
        for d in sorted(history.keys())[-7:]
    )

    return f"""
<html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#333;">
  <h2 style="color:#232f3e;border-bottom:2px solid #ff9900;padding-bottom:8px;">
    Amazon Best Seller Badge Report
  </h2>
  <p style="color:#666;font-size:13px;">Date: <strong>{date_str}</strong></p>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="text-align:left;padding:8px;">Product</th>
        <th style="padding:8px;">Today</th>
        {trend_header}
      </tr>
    </thead>
    <tbody>{rows}
    </tbody>
  </table>
  <p style="font-size:11px;color:#999;margin-top:20px;">
    Automated daily check · bodyj4you
  </p>
</body></html>"""


def build_email_text(date_str: str, results: list) -> str:
    lines = [f"Amazon Best Seller Badge Report — {date_str}", "=" * 50]
    for r in results:
        status = r["status"].upper()
        lines.append(f"{r['name']}: {status}  ({r['url']})")
    return "\n".join(lines)


def send_email(subject: str, html_body: str, text_body: str):
    sender = os.environ["GMAIL_SENDER_EMAIL"]
    password = os.environ["GMAIL_APP_PASSWORD"]
    recipient = os.environ["RECIPIENT_EMAIL"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipient, msg.as_string())
    print(f"Email sent to {recipient}")


def main():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"Running best-seller check for {today}")

    results = []
    for product in PRODUCTS:
        print(f"  Checking {product['name']} …")
        result = check_product(product)
        results.append(result)
        print(f"    → {result['status'].upper()}")
        time.sleep(random.uniform(3, 7))

    # Update history
    history = load_history()
    history[today] = results
    save_history(history)
    print(f"History saved ({len(history)} days on record)")

    # Send email
    yes_count = sum(1 for r in results if r["status"] == "yes")
    subject = f"Amazon Best Seller Check {today} — {yes_count}/{len(results)} badges active"
    html = build_email_html(today, results, history)
    text = build_email_text(today, results)
    send_email(subject, html, text)


if __name__ == "__main__":
    main()
