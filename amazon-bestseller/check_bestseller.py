#!/usr/bin/env python3
"""
Amazon Best Seller badge checker.

Checks 3 product listings daily, stores history, outputs results as JSON.

Required environment variable (pick one):
  SCRAPERAPI_KEY    — ScraperAPI.com key (free tier: 5k req/month)
                      Sign up free at https://www.scraperapi.com/

Optional:
  GMAIL_APP_PASSWORD — Gmail app password for SMTP sending
                        (Settings > Security > App passwords in Google Account)
  GMAIL_SENDER       — sender address, defaults to frolovdo@gmail.com
"""

import json
import os
import sys
import time
import random
import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from bs4 import BeautifulSoup

PRODUCTS = [
    {
        "name": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1",
        "short_url": "https://www.amazon.com/dp/B08L8VZHKR",
    },
    {
        "name": "PN10-Master",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
        "short_url": "https://www.amazon.com/dp/B004MZMBC4",
    },
    {
        "name": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
        "short_url": "https://www.amazon.com/dp/B0785J3B94",
    },
]

HISTORY_FILE = Path(__file__).parent / "history.json"
EMAIL_RECIPIENT = "denis@bodyj4you.com"

DIRECT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.google.com/",
    "Upgrade-Insecure-Requests": "1",
}


def load_history() -> dict:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {"checks": []}


def save_history(history: dict):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def has_best_seller_badge(html: str) -> bool:
    soup = BeautifulSoup(html, "lxml")

    # Method 1: Badge ribbon elements
    for tag in soup.find_all(["span", "i", "div", "a"]):
        text = tag.get_text(strip=True).lower()
        if "best seller" in text or "best-seller" in text:
            return True

    # Method 2: Bestsellers rank section with #1
    rank_div = soup.find(id="bestsellersRank")
    if rank_div and "#1" in rank_div.get_text():
        return True

    # Method 3: Any text node containing "Best Seller"
    for text_node in soup.find_all(string=lambda t: t and "Best Seller" in t):
        return True

    # Method 4: zg_hrsr (bestseller list anchor)
    if soup.find(id="zg_hrsr"):
        return True

    return False


def fetch_direct(url: str, session: requests.Session) -> str | None:
    """Try direct fetch. Returns HTML or None on failure."""
    try:
        time.sleep(random.uniform(1, 3))
        resp = session.get(url, headers=DIRECT_HEADERS, timeout=30, allow_redirects=True)
        if resp.status_code == 200 and len(resp.text) > 5000:
            return resp.text
        print(f"    Direct fetch: HTTP {resp.status_code}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"    Direct fetch error: {e}", file=sys.stderr)
        return None


def fetch_via_scraperapi(url: str, api_key: str) -> str | None:
    """Fetch via ScraperAPI (handles Amazon bot detection)."""
    try:
        proxy_url = (
            f"http://api.scraperapi.com"
            f"?api_key={api_key}"
            f"&url={requests.utils.quote(url)}"
            f"&render=true"
            f"&country_code=us"
        )
        resp = requests.get(proxy_url, timeout=90)
        if resp.status_code == 200 and len(resp.text) > 5000:
            return resp.text
        print(f"    ScraperAPI: HTTP {resp.status_code}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"    ScraperAPI error: {e}", file=sys.stderr)
        return None


def check_product(product: dict, scraperapi_key: str | None, session: requests.Session) -> dict:
    html = None

    # Try ScraperAPI first if key is configured
    if scraperapi_key:
        print(f"    Using ScraperAPI...", file=sys.stderr)
        html = fetch_via_scraperapi(product["url"], scraperapi_key)

    # Fall back to direct request
    if html is None:
        print(f"    Trying direct fetch...", file=sys.stderr)
        html = fetch_direct(product["url"], session)

    if html is None:
        return {
            "name": product["name"],
            "url": product["short_url"],
            "has_badge": None,
            "error": "Could not fetch page (blocked by Amazon). Set SCRAPERAPI_KEY env var.",
        }

    badge = has_best_seller_badge(html)
    return {
        "name": product["name"],
        "url": product["short_url"],
        "has_badge": badge,
        "error": None,
    }


def build_email_html(date_str: str, results: list) -> tuple[str, str]:
    rows_html = ""
    rows_text = ""

    for r in results:
        if r["has_badge"] is None:
            status = f"ERROR: {r.get('error', 'Unknown error')}"
            emoji = "⚠️"
            color = "#f59e0b"
        elif r["has_badge"]:
            status = "YES — Has Best Seller badge"
            emoji = "✅"
            color = "#16a34a"
        else:
            status = "NO — No Best Seller badge"
            emoji = "❌"
            color = "#dc2626"

        rows_html += f"""
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">
            <a href="{r['url']}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">
              {r['name']}
            </a>
          </td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:{color};font-weight:600;">
            {emoji} {status}
          </td>
        </tr>"""

        rows_text += f"  {r['name']}: {status}\n"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937;">
  <h2 style="color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:10px;">
    Amazon Best Seller Report — {date_str}
  </h2>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:10px;text-align:left;font-size:13px;color:#6b7280;text-transform:uppercase;">Product</th>
        <th style="padding:10px;text-align:left;font-size:13px;color:#6b7280;text-transform:uppercase;">Best Seller Status</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>
  <p style="margin-top:20px;font-size:12px;color:#9ca3af;">
    Checked automatically on {date_str} UTC · bodyj4you Amazon monitoring
  </p>
</body>
</html>"""

    text = (
        f"Amazon Best Seller Report — {date_str}\n\n"
        f"{rows_text}\n"
        f"Checked automatically · bodyj4you Amazon monitoring\n"
    )
    return html, text


def send_via_smtp(html: str, text: str, subject: str) -> None:
    """Send email via Gmail SMTP using app password. Raises on failure."""
    app_password = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    sender = os.environ.get("GMAIL_SENDER", "frolovdo@gmail.com").strip()

    if not app_password:
        raise ValueError("GMAIL_APP_PASSWORD not set")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = EMAIL_RECIPIENT
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(sender, app_password)
        server.sendmail(sender, EMAIL_RECIPIENT, msg.as_string())


def main():
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    scraperapi_key = os.environ.get("SCRAPERAPI_KEY", "").strip() or None

    if not scraperapi_key:
        print(
            "WARNING: SCRAPERAPI_KEY not set. Direct Amazon requests will likely be blocked.\n"
            "Sign up free at https://www.scraperapi.com/ and set SCRAPERAPI_KEY in session env.",
            file=sys.stderr,
        )

    print(f"Checking Amazon listings on {date_str}...", file=sys.stderr)

    session = requests.Session()
    results = []
    for product in PRODUCTS:
        print(f"  Checking {product['name']}...", file=sys.stderr)
        result = check_product(product, scraperapi_key, session)
        results.append(result)
        badge_str = "YES" if result["has_badge"] else ("ERROR" if result["has_badge"] is None else "NO")
        print(f"    → {badge_str}", file=sys.stderr)
        time.sleep(random.uniform(1, 2))

    # Update persistent history
    history = load_history()
    history["checks"].append({"date": date_str, "results": results})
    save_history(history)
    print(f"History saved to {HISTORY_FILE}", file=sys.stderr)

    subject = f"Amazon Best Seller Report — {date_str}"
    html_body, text_body = build_email_html(date_str, results)

    # Try SMTP; Claude will use Gmail MCP create_draft as fallback
    smtp_sent = False
    smtp_error = None
    try:
        send_via_smtp(html_body, text_body, subject)
        smtp_sent = True
        print(f"Email sent via Gmail SMTP to {EMAIL_RECIPIENT}.", file=sys.stderr)
    except ValueError as e:
        smtp_error = str(e)
    except Exception as e:
        smtp_error = str(e)
        print(f"SMTP send failed: {e}", file=sys.stderr)

    # JSON output for Claude to consume (draft fallback, history logging)
    output = {
        "date": date_str,
        "results": results,
        "subject": subject,
        "html_body": html_body,
        "text_body": text_body,
        "smtp_sent": smtp_sent,
        "smtp_error": smtp_error,
        "recipient": EMAIL_RECIPIENT,
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
