#!/usr/bin/env python3
"""
Daily Amazon Best Seller badge checker.
Fetches each listing, checks for the badge, appends to history JSON,
and sends a summary email via Gmail SMTP.

Required env vars:
  GMAIL_SENDER       - sender Gmail address (e.g. frolovdo@gmail.com)
  GMAIL_APP_PASSWORD - Gmail app password (16-char, no spaces)
  RECIPIENT_EMAIL    - where to send the report
"""

import json
import os
import random
import smtplib
import sys
import time
from datetime import date, datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LISTINGS = [
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

HISTORY_FILE = Path(__file__).parent.parent / "data" / "amazon_bestseller_history.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

# ---------------------------------------------------------------------------
# Scraping
# ---------------------------------------------------------------------------

def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
        "DNT": "1",
    })
    return s


def has_best_seller_badge(html: str) -> bool:
    """Return True if any recognised Best Seller signal exists in the HTML."""
    soup = BeautifulSoup(html, "lxml")

    # 1. Badge text inside known Amazon badge elements
    for tag in soup.select(".a-badge-text, .badge-label, #bestSellers, #bestseller-badge"):
        if "best seller" in tag.get_text(strip=True).lower():
            return True

    # 2. Any element whose text is exactly "Best Seller" or "#1 Best Seller"
    for tag in soup.find_all(string=lambda t: t and "best seller" in t.lower()):
        return True

    # 3. Raw HTML string search as fallback
    lower_html = html.lower()
    for phrase in ("best seller", "#1 best seller", "bestseller"):
        if phrase in lower_html:
            return True

    return False


def check_listing(session: requests.Session, listing: dict) -> dict:
    """Fetch one listing and return a result dict."""
    try:
        time.sleep(random.uniform(2, 5))
        r = session.get(listing["url"], timeout=20, allow_redirects=True)
        r.raise_for_status()
        badge = has_best_seller_badge(r.text)
        status = "YES" if badge else "NO"
        error = None
    except Exception as exc:
        status = "ERROR"
        error = str(exc)

    return {
        "name": listing["name"],
        "url": listing["url"],
        "asin": listing["asin"],
        "status": status,
        "error": error,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def load_history() -> list:
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text())
    return []


def save_history(history: list) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2))


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def build_email(results: list, today: str) -> tuple[str, str, str]:
    """Return (subject, plain_body, html_body)."""
    subject = f"Amazon Best Seller Check — {today}"

    rows_html = ""
    rows_plain = ""
    for r in results:
        icon = "✅" if r["status"] == "YES" else ("⚠️" if r["status"] == "ERROR" else "❌")
        color = "#22863a" if r["status"] == "YES" else ("#e36209" if r["status"] == "ERROR" else "#cb2431")
        rows_html += (
            f"<tr>"
            f'<td style="padding:8px 12px;border-bottom:1px solid #eee;">'
            f'<a href="{r["url"]}" style="color:#0366d6;font-weight:bold;">{r["name"]}</a></td>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #eee;color:{color};font-weight:bold;">'
            f"{icon} {r['status']}</td>"
            f"</tr>\n"
        )
        rows_plain += f"  {r['name']}: {r['status']}\n"
        if r.get("error"):
            rows_plain += f"    Error: {r['error']}\n"

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#24292e;max-width:600px;margin:0 auto;">
  <h2 style="border-bottom:2px solid #e1e4e8;padding-bottom:8px;">
    Amazon Best Seller Badge — {today}
  </h2>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:#f6f8fa;">
        <th style="padding:8px 12px;text-align:left;">Product</th>
        <th style="padding:8px 12px;text-align:left;">Best Seller?</th>
      </tr>
    </thead>
    <tbody>
{rows_html}
    </tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#6a737d;">
    Checked automatically by the Amazon Best Seller Monitor.
  </p>
</body>
</html>"""

    plain_body = f"Amazon Best Seller Check — {today}\n\n{rows_plain}"

    return subject, plain_body, html_body


def send_email(subject: str, plain_body: str, html_body: str, recipient: str) -> None:
    sender = os.environ["GMAIL_SENDER"]
    password = os.environ["GMAIL_APP_PASSWORD"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(sender, password)
        smtp.sendmail(sender, [recipient], msg.as_string())

    print(f"Email sent to {recipient}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    recipient = os.environ.get("RECIPIENT_EMAIL", "denis@bodyj4you.com")
    today = date.today().isoformat()

    session = _session()
    results = []
    for listing in LISTINGS:
        print(f"Checking {listing['name']}…")
        result = check_listing(session, listing)
        results.append(result)
        print(f"  → {result['status']}" + (f" ({result['error']})" if result.get("error") else ""))

    # Append to history
    history = load_history()
    history.append({"date": today, "results": results})
    save_history(history)
    print(f"History saved to {HISTORY_FILE}")

    # Send email
    subject, plain_body, html_body = build_email(results, today)
    send_email(subject, plain_body, html_body, recipient)

    # Exit non-zero if any check errored so the GH Action fails visibly
    if any(r["status"] == "ERROR" for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
