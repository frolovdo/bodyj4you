#!/usr/bin/env python3
"""Daily Amazon Best Seller badge checker.

Checks each listing for the Best Seller badge, appends to history JSON,
and sends a report email via Gmail SMTP.

Required env vars:
  GMAIL_USER          - Gmail address to send from
  GMAIL_APP_PASSWORD  - Gmail App Password (not your regular password)
  RECIPIENT_EMAIL     - Where to send the report (default: denis@bodyj4you.com)
"""

import asyncio
import json
import os
import smtplib
import sys
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from playwright.async_api import async_playwright

LISTINGS = [
    {
        "name": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1",
        "display_url": "https://www.amazon.com/dp/B08L8VZHKR",
    },
    {
        "name": "PN10-Master",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
        "display_url": "https://www.amazon.com/dp/B004MZMBC4",
    },
    {
        "name": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
        "display_url": "https://www.amazon.com/dp/B0785J3B94",
    },
]

HISTORY_FILE = Path(__file__).parent.parent / "amazon_bestseller_history.json"

RECIPIENT_EMAIL = os.environ.get("RECIPIENT_EMAIL", "denis@bodyj4you.com")


async def check_best_seller(page, listing: dict) -> str:
    """Return 'YES', 'NO', or 'ERROR: ...' for a listing."""
    try:
        await page.goto(listing["url"], wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        content = await page.content()

        # Detect block / CAPTCHA pages (very short = something wrong)
        if len(content) < 5000:
            return "ERROR: page too short (possible block)"
        if "robot check" in content.lower() or "enter the characters" in content.lower():
            return "ERROR: CAPTCHA detected"

        # Primary: look for best seller badge text
        if "#1 Best Seller" in content or "Best Seller" in content:
            return "YES"

        return "NO"

    except Exception as e:
        return f"ERROR: {str(e)[:120]}"


async def run_checks() -> tuple[list[dict], str]:
    """Run all listing checks and return (results, today_date)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;"
                    "q=0.9,image/webp,*/*;q=0.8"
                ),
            },
        )
        page = await context.new_page()

        for listing in LISTINGS:
            status = await check_best_seller(page, listing)
            entry = {
                "date": today,
                "name": listing["name"],
                "url": listing["display_url"],
                "best_seller": status,
            }
            results.append(entry)
            print(f"  {listing['name']}: {status}")

        await browser.close()

    return results, today


def load_history() -> list[dict]:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return []


def save_history(history: list[dict]) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def _status_cell(status: str) -> str:
    if status == "YES":
        return '<td style="color:#27ae60;font-weight:bold;text-align:center;">✅ YES</td>'
    if status == "NO":
        return '<td style="color:#e74c3c;text-align:center;">❌ NO</td>'
    return f'<td style="color:#f39c12;text-align:center;">⚠️ {status}</td>'


def build_email_html(results: list[dict], today: str, history: list[dict]) -> str:
    today_rows = ""
    for r in results:
        today_rows += f"""
        <tr>
          <td><a href="{r['url']}" style="color:#1a73e8;">{r['name']}</a></td>
          <td style="text-align:center;">{r['date']}</td>
          {_status_cell(r['best_seller'])}
        </tr>"""

    # Last 30 historical entries (excluding today, already shown above)
    past = [e for e in history if e["date"] < today][-30:]
    history_rows = ""
    for r in reversed(past):
        history_rows += f"""
        <tr>
          <td><a href="{r['url']}" style="color:#1a73e8;">{r['name']}</a></td>
          <td style="text-align:center;">{r['date']}</td>
          {_status_cell(r['best_seller'])}
        </tr>"""

    history_section = ""
    if history_rows:
        history_section = f"""
        <h3 style="margin-top:32px;">Previous Checks</h3>
        <table {TABLE_STYLE}>
          <tr style="background:#f5f5f5;">
            <th style="text-align:left;padding:8px;">Product</th>
            <th style="padding:8px;">Date</th>
            <th style="padding:8px;">Best Seller?</th>
          </tr>
          {history_rows}
        </table>"""

    return f"""
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:640px;margin:auto;padding:20px;">
  <h2 style="border-bottom:2px solid #1a73e8;padding-bottom:8px;">
    Amazon Best Seller Daily Report — {today}
  </h2>

  <h3>Today's Results</h3>
  <table {TABLE_STYLE}>
    <tr style="background:#f5f5f5;">
      <th style="text-align:left;padding:8px;">Product</th>
      <th style="padding:8px;">Date</th>
      <th style="padding:8px;">Best Seller?</th>
    </tr>
    {today_rows}
  </table>
  {history_section}

  <p style="color:#999;font-size:12px;margin-top:32px;">
    Automated check · History stored in
    <a href="https://github.com/frolovdo/bodyj4you" style="color:#999;">
      frolovdo/bodyj4you
    </a>
  </p>
</body>
</html>"""


TABLE_STYLE = (
    'border="1" cellpadding="8" cellspacing="0" '
    'style="border-collapse:collapse;width:100%;"'
)


def send_email(results: list[dict], today: str, history: list[dict]) -> None:
    gmail_user = os.environ.get("GMAIL_USER")
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD")

    if not gmail_user or not gmail_password:
        print("WARNING: GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email.")
        return

    html_body = build_email_html(results, today, history)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Amazon Best Seller Check — {today}"
    msg["From"] = gmail_user
    msg["To"] = RECIPIENT_EMAIL
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_password)
        server.send_message(msg)

    print(f"Email sent to {RECIPIENT_EMAIL}")


def main() -> None:
    print(f"Checking Amazon listings...")
    results, today = asyncio.run(run_checks())

    history = load_history()
    history.extend(results)
    save_history(history)
    print(f"History updated ({len(history)} total entries)")

    send_email(results, today, history)

    print("\nDone.")
    for r in results:
        print(f"  {r['name']}: {r['best_seller']}")


if __name__ == "__main__":
    main()
