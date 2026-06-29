#!/usr/bin/env python3
"""
Amazon Best Seller badge checker.
Checks product listings for the #1 Best Seller badge.
Sends an HTML email report via Gmail SMTP and commits history to the repo.

Required env var for email:
  GMAIL_APP_PASSWORD  — 16-char Google App Password for frolovdo@gmail.com

Usage:
  python3 automation/bestseller_check.py
"""

import json
import os
import re
import smtplib
import sys
import time
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

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

HISTORY_FILE = Path(__file__).parent / "history.json"
EMAIL_TO = "denis@bodyj4you.com"
EMAIL_FROM = "frolovdo@gmail.com"
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

# Playwright uses the bundled Chromium when running in GitHub Actions
CHROMIUM_PATH = os.environ.get(
    "CHROMIUM_PATH",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
)


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def load_history() -> dict:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {}


def save_history(history: dict) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2, sort_keys=True)


# ---------------------------------------------------------------------------
# Amazon scraping
# ---------------------------------------------------------------------------

def check_bestseller(page, url: str, name: str) -> bool | None:
    """Return True = badge found, False = not found, None = error."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(4000)
        html = page.content()

        # Amazon renders the badge in several places; check multiple signals
        if re.search(r"#1 Best Seller|Best Seller in", html):
            return True
        if re.search(r'p13n-best-seller|bestSellerBadge|SalesRank', html):
            # Confirm it's actually in the "Best Seller" context
            if "Best Seller" in html:
                return True
        return False

    except Exception as exc:
        print(f"  Error checking {name}: {exc}", file=sys.stderr)
        return None


def run_checks() -> dict[str, bool | None]:
    # Import here so the file can be imported without playwright installed
    from playwright.sync_api import sync_playwright

    results: dict[str, bool | None] = {}

    launch_kwargs: dict = {
        "headless": True,
        "args": [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    }
    # Use pinned binary when available (local dev / this container)
    if os.path.exists(CHROMIUM_PATH):
        launch_kwargs["executable_path"] = CHROMIUM_PATH

    with sync_playwright() as pw:
        browser = pw.chromium.launch(**launch_kwargs)
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        page = ctx.new_page()
        page.set_extra_http_headers({"Accept-Language": "en-US,en;q=0.9"})

        for i, product in enumerate(PRODUCTS):
            if i > 0:
                time.sleep(3)
            name = product["name"]
            url = product["url"]
            print(f"Checking {name} …")
            result = check_bestseller(page, url, name)
            results[name] = result
            label = (
                "✅ Best Seller"
                if result is True
                else ("❌ Not Best Seller" if result is False else "⚠️ Error")
            )
            print(f"  -> {label}")

        browser.close()

    return results


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def _status_cell(result: bool | None) -> tuple[str, str]:
    """Return (label, background-color) for the result."""
    if result is True:
        return "YES ✅", "#d4edda"
    if result is False:
        return "NO ❌", "#f8d7da"
    return "ERROR ⚠️", "#fff3cd"


def build_html(results: dict, date_str: str, history: dict) -> str:
    today_rows = ""
    for p in PRODUCTS:
        name, url = p["name"], p["url"]
        label, bg = _status_cell(results.get(name))
        today_rows += (
            f'<tr style="background:{bg}">'
            f'<td style="padding:8px;border:1px solid #ddd">'
            f'<a href="{url}">{name}</a></td>'
            f'<td style="padding:8px;border:1px solid #ddd;text-align:center">'
            f"{label}</td></tr>\n"
        )

    hist_rows = ""
    for p in PRODUCTS:
        name, url = p["name"], p["url"]
        phist = history.get(name, {})
        dates = sorted(phist.keys())[-14:]
        if not dates:
            continue
        date_headers = "".join(
            f'<th style="padding:3px 5px;border:1px solid #ddd;'
            f'font-size:10px;white-space:nowrap">{d[5:]}</th>'
            for d in dates
        )
        cells = "".join(
            f'<td style="padding:3px;border:1px solid #ddd;text-align:center;'
            f'background:{"#d4edda" if phist[d] else "#f8d7da"}">'
            f'{"✅" if phist[d] else "❌"}</td>'
            for d in dates
        )
        hist_rows += (
            f"<tr>"
            f'<td rowspan="2" style="padding:4px;border:1px solid #ddd;'
            f'vertical-align:middle;min-width:120px">'
            f'<a href="{url}">{name}</a></td>'
            f"{date_headers}</tr>\n"
            f"<tr>{cells}</tr>\n"
        )

    return f"""<!DOCTYPE html><html><body style="font-family:sans-serif;color:#222">
<h2 style="color:#232f3e;margin-bottom:4px">Amazon Best Seller Report</h2>
<p style="color:#666;margin-top:0">{date_str}</p>

<table style="border-collapse:collapse;width:100%;max-width:500px;margin-bottom:28px">
  <tr style="background:#f2f2f2">
    <th style="padding:8px;border:1px solid #ddd;text-align:left">Product</th>
    <th style="padding:8px;border:1px solid #ddd">Best Seller Today?</th>
  </tr>
  {today_rows}
</table>

<h3 style="margin-bottom:6px">14-Day History</h3>
<table style="border-collapse:collapse;font-size:12px">
  <tr style="background:#f2f2f2">
    <th style="padding:4px;border:1px solid #ddd;text-align:left;min-width:120px">Product</th>
    <th colspan="14" style="padding:4px;border:1px solid #ddd">Date (MM-DD)</th>
  </tr>
  {hist_rows}
</table>
</body></html>"""


def send_email(results: dict, date_str: str, history: dict) -> bool:
    if not GMAIL_APP_PASSWORD:
        print("GMAIL_APP_PASSWORD not set — skipping email.", file=sys.stderr)
        return False

    yes_count = sum(1 for v in results.values() if v is True)
    subject = (
        f"Amazon Best Seller — {date_str} "
        f"| {yes_count}/{len(PRODUCTS)} listings have badge"
    )
    html = build_html(results, date_str, history)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = EMAIL_TO
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as srv:
            srv.login(EMAIL_FROM, GMAIL_APP_PASSWORD)
            srv.send_message(msg)
        print(f"Email sent to {EMAIL_TO}")
        return True
    except Exception as exc:
        print(f"Email send failed: {exc}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    date_str = datetime.now().strftime("%Y-%m-%d")
    history = load_history()

    print(f"=== Amazon Best Seller Check: {date_str} ===")
    results = run_checks()

    # Update history (only record definitive results)
    for name, result in results.items():
        if result is not None:
            history.setdefault(name, {})[date_str] = result
    save_history(history)
    print(f"History saved to {HISTORY_FILE}")

    # Print summary
    print("\n--- Summary ---")
    for name, result in results.items():
        status = "YES" if result is True else ("NO" if result is False else "ERROR")
        print(f"  {date_str} | {name} | {status}")

    send_email(results, date_str, history)
    return 0


if __name__ == "__main__":
    sys.exit(main())
