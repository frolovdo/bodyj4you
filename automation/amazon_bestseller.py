#!/usr/bin/env python3
"""
Amazon Best Seller badge daily checker.

Checks three product listings for the #1 Best Seller badge, stores a running
history, and emails a report to denis@bodyj4you.com.

Required environment variables (set as GitHub Actions secrets):
  GMAIL_FROM          – Gmail address to send from (e.g. you@gmail.com)
  GMAIL_APP_PASSWORD  – Gmail App Password (not your regular password)
"""

import json
import os
import re
import smtplib
import sys
from datetime import date, timezone, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LISTINGS = [
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

HISTORY_FILE = (
    Path(__file__).parent.parent / "data" / "bestseller-history" / "history.json"
)

EMAIL_TO = "denis@bodyj4you.com"
EMAIL_FROM = os.environ.get("GMAIL_FROM", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")


# ---------------------------------------------------------------------------
# Badge detection
# ---------------------------------------------------------------------------

# Patterns that indicate a Best Seller badge is displayed on the page.
BADGE_PATTERNS = [
    re.compile(r'#1\s+Best\s+Seller', re.IGNORECASE),
    re.compile(r'"isBestSeller"\s*:\s*true', re.IGNORECASE),
    re.compile(r'class="[^"]*bestseller[^"]*"', re.IGNORECASE),
    re.compile(r'Best\s+Seller\s+in\s+\w', re.IGNORECASE),
]


def check_best_seller(url: str) -> str:
    """Return 'YES', 'NO', or 'ERROR' for the Best Seller badge at *url*."""
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="America/New_York",
            viewport={"width": 1280, "height": 900},
            java_script_enabled=True,
        )
        # Mask the webdriver flag so Amazon's bot detection is less likely to fire.
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = context.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            # Brief pause so dynamic content can render.
            page.wait_for_timeout(2_000)
            html = page.content()

            for pattern in BADGE_PATTERNS:
                if pattern.search(html):
                    return "YES"
            return "NO"

        except PlaywrightTimeoutError:
            print(f"  Timeout loading {url}", file=sys.stderr)
            return "ERROR"
        except Exception as exc:
            print(f"  Error checking {url}: {exc}", file=sys.stderr)
            return "ERROR"
        finally:
            browser.close()


# ---------------------------------------------------------------------------
# History persistence
# ---------------------------------------------------------------------------

def load_history() -> dict:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text())
    return {"checks": []}


def save_history(history: dict) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Email report
# ---------------------------------------------------------------------------

def _badge_color(status: str) -> str:
    return "#2e7d32" if status == "YES" else ("#c62828" if status == "NO" else "#555")


def build_email(today: str, results: list, history: dict) -> tuple[str, str]:
    """Return (plain_text, html_body) for the daily report email."""
    # Today's quick summary
    lines = [f"Amazon Best Seller Badge Report — {today}", ""]
    for r in results:
        lines.append(f"  {r['name']}: {r['best_seller']}")
    lines += ["", "Full history: see HTML version or the repository."]
    plain = "\n".join(lines)

    # Build history rows (newest first, cap at 60 days)
    all_checks = history.get("checks", [])
    row_html = ""
    for check in reversed(all_checks[-60:]):
        for r in check["results"]:
            color = _badge_color(r["best_seller"])
            row_html += (
                f'<tr>'
                f'<td style="padding:7px 10px;border:1px solid #e0e0e0">{check["date"]}</td>'
                f'<td style="padding:7px 10px;border:1px solid #e0e0e0">'
                f'<a href="{r["url"]}" style="color:#1565c0">{r["name"]}</a></td>'
                f'<td style="padding:7px 10px;border:1px solid #e0e0e0;color:{color};font-weight:bold">'
                f'{r["best_seller"]}</td>'
                f'</tr>\n'
            )

    today_rows = "".join(
        f'<li><a href="{r["url"]}" style="color:#1565c0">{r["name"]}</a>: '
        f'<strong style="color:{_badge_color(r["best_seller"])}">{r["best_seller"]}</strong></li>'
        for r in results
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#212121;max-width:700px;margin:0 auto;padding:20px">
  <h2 style="color:#1a237e">Amazon Best Seller Badge Report</h2>
  <p style="color:#555;margin-top:-10px">{today}</p>

  <h3>Today's Results</h3>
  <ul>{today_rows}</ul>

  <h3>History</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="background:#e8eaf6">
        <th style="padding:8px 10px;border:1px solid #c5cae9;text-align:left">Date</th>
        <th style="padding:8px 10px;border:1px solid #c5cae9;text-align:left">Product</th>
        <th style="padding:8px 10px;border:1px solid #c5cae9;text-align:left">Best Seller?</th>
      </tr>
    </thead>
    <tbody>
      {row_html}
    </tbody>
  </table>
  <p style="font-size:12px;color:#9e9e9e;margin-top:20px">
    Automated check · bodyj4you
  </p>
</body>
</html>"""
    return plain, html


def send_email(today: str, results: list, history: dict) -> None:
    if not EMAIL_FROM or not GMAIL_APP_PASSWORD:
        print("GMAIL_FROM / GMAIL_APP_PASSWORD not set — skipping email.", file=sys.stderr)
        return

    plain, html = build_email(today, results, history)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Best Seller Badge Report — {today}"
    msg["From"] = EMAIL_FROM
    msg["To"] = EMAIL_TO
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_FROM, GMAIL_APP_PASSWORD)
            server.sendmail(EMAIL_FROM, EMAIL_TO, msg.as_string())
        print(f"Email sent to {EMAIL_TO}")
    except Exception as exc:
        print(f"Failed to send email: {exc}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    today = str(date.today())
    print(f"=== Amazon Best Seller check — {today} ===")

    results = []
    for listing in LISTINGS:
        print(f"Checking {listing['name']} …", flush=True)
        status = check_best_seller(listing["url"])
        results.append(
            {"name": listing["name"], "url": listing["url"], "best_seller": status}
        )
        print(f"  → {status}")

    history = load_history()
    history["checks"].append({"date": today, "results": results})
    save_history(history)
    print(f"History saved → {HISTORY_FILE}")

    send_email(today, results, history)


if __name__ == "__main__":
    main()
