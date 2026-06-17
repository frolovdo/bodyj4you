"""
Daily Amazon Best Seller badge checker.

Uses a real Chromium browser (Playwright) to bypass Amazon's bot detection.
Reads data/bestseller_history.json, checks each listing, appends today's result,
writes the updated history back, then emails a summary.

Required env vars:
  GMAIL_USER          – Gmail address used to send (the FROM address)
  GMAIL_APP_PASSWORD  – 16-char Gmail App Password
  RECIPIENT_EMAIL     – address to receive the report
"""

import json
import os
import re
import smtplib
import time
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# ── product definitions ────────────────────────────────────────────────────────
PRODUCTS = [
    {
        "id": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1",
    },
    {
        "id": "PN10-Master",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
    },
    {
        "id": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
    },
]

HISTORY_PATH = Path(__file__).parent.parent / "data" / "bestseller_history.json"


def fetch_page(url: str, retries: int = 3) -> str | None:
    """Fetch URL using a real Chromium browser; return full HTML or None."""
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;"
                    "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
                ),
            },
        )

        # Hide webdriver flag
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        page = context.new_page()
        for attempt in range(1, retries + 1):
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(3_000)  # let JS render badges
                html = page.content()
                browser.close()
                return html
            except Exception as exc:
                print(f"  Attempt {attempt}: browser error – {exc}")
                if attempt < retries:
                    time.sleep(5 * attempt)

        browser.close()
    return None


def detect_best_seller(html: str) -> bool:
    """Return True if the page contains an active Best Seller badge."""
    soup = BeautifulSoup(html, "html.parser")

    # Pattern 1: explicit #1 Best Seller text anywhere
    if re.search(r"#1\s+Best\s+Seller", html, re.I):
        return True

    # Pattern 2: badge-text span
    for span in soup.find_all("span", class_="a-badge-text"):
        if "best seller" in span.get_text(strip=True).lower():
            return True

    # Pattern 3: known badge container IDs
    for div_id in ("acBadge_feature_div", "zeitgeistBadge_feature_div"):
        div = soup.find(id=div_id)
        if div and "best seller" in div.get_text().lower():
            return True

    # Pattern 4: any element with "bestseller" in its class name
    for tag in soup.find_all(class_=re.compile(r"bestseller", re.I)):
        if "best seller" in tag.get_text().lower():
            return True

    # Pattern 5: sales rank span (#1 in a category counts)
    rank_span = soup.find("span", id=re.compile(r"SalesRank", re.I))
    if rank_span and "#1" in rank_span.get_text():
        return True

    return False


def load_history() -> dict:
    if HISTORY_PATH.exists():
        with open(HISTORY_PATH) as f:
            return json.load(f)
    return {p["id"]: [] for p in PRODUCTS}


def save_history(history: dict) -> None:
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)


def build_email_html(results: list[dict], today: str, history: dict) -> str:
    product_rows = ""
    for r in results:
        badge_label = "✅ YES" if r["best_seller"] else ("⚠️ ERROR" if r["status"] == "ERROR" else "❌ NO")
        badge_color = "#16a766" if r["best_seller"] else ("#cf8933" if r["status"] == "ERROR" else "#e66550")

        # Build 7-day history sparkline (last 7 entries)
        past = history.get(r["id"], [])[-7:]
        spark = ""
        for entry in past:
            if entry["status"] == "YES":
                spark += '<span style="color:#16a766;">●</span>'
            elif entry["status"] == "ERROR":
                spark += '<span style="color:#cf8933;">●</span>'
            else:
                spark += '<span style="color:#ccc;">●</span>'

        product_rows += f"""
        <tr>
          <td style="padding:12px 16px; border-bottom:1px solid #eee;">
            <a href="{r['url']}" style="color:#0066c0; text-decoration:none; font-weight:600;">
              {r['id']}
            </a>
          </td>
          <td style="padding:12px 16px; border-bottom:1px solid #eee; text-align:center; color:#555;">
            {today}
          </td>
          <td style="padding:12px 16px; border-bottom:1px solid #eee; text-align:center;
                     color:{badge_color}; font-weight:700; font-size:15px;">
            {badge_label}
          </td>
          <td style="padding:12px 16px; border-bottom:1px solid #eee; text-align:center;
                     font-size:18px; letter-spacing:2px;">
            {spark}
          </td>
        </tr>"""

    return f"""
    <html><body style="font-family:Arial,sans-serif; color:#333; max-width:650px; margin:0 auto; padding:20px;">
      <div style="background:#232f3e; padding:16px 24px; border-radius:6px 6px 0 0;">
        <h2 style="color:#ff9900; margin:0; font-size:20px;">Amazon Best Seller Report</h2>
        <p style="color:#aaa; margin:4px 0 0; font-size:13px;">{today}</p>
      </div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #ddd; border-top:none;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px 16px; text-align:left; font-size:13px; color:#555;">Product</th>
            <th style="padding:10px 16px; text-align:center; font-size:13px; color:#555;">Date</th>
            <th style="padding:10px 16px; text-align:center; font-size:13px; color:#555;">Best Seller?</th>
            <th style="padding:10px 16px; text-align:center; font-size:13px; color:#555;">Last 7 days</th>
          </tr>
        </thead>
        <tbody>{product_rows}
        </tbody>
      </table>
      <p style="margin-top:16px; font-size:11px; color:#aaa;">
        ● green = YES &nbsp;|&nbsp; ● grey = NO &nbsp;|&nbsp; ● amber = check error
        <br>Checked automatically via GitHub Actions · history in <code>data/bestseller_history.json</code>
      </p>
    </body></html>"""


def send_email(subject: str, html_body: str) -> None:
    gmail_user = os.environ["GMAIL_USER"]
    gmail_pass = os.environ["GMAIL_APP_PASSWORD"]
    recipient = os.environ["RECIPIENT_EMAIL"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = recipient
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_pass)
        server.sendmail(gmail_user, recipient, msg.as_string())
    print(f"Email sent → {recipient}")


def main() -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    history = load_history()
    results = []

    for product in PRODUCTS:
        pid = product["id"]
        url = product["url"]
        print(f"\nChecking {pid} …")

        html = fetch_page(url)
        if html is None:
            status = "ERROR"
            best_seller = False
            print("  → FAILED to fetch page")
        elif "robot" in html.lower() or "captcha" in html.lower():
            status = "ERROR"
            best_seller = False
            print("  → CAPTCHA / bot check encountered")
        else:
            best_seller = detect_best_seller(html)
            status = "YES" if best_seller else "NO"
            print(f"  → Best Seller: {status}")

        entry = {"date": today, "status": status}
        if pid not in history:
            history[pid] = []
        history[pid].append(entry)

        results.append({"id": pid, "url": url, "best_seller": best_seller, "status": status})
        time.sleep(4)

    save_history(history)
    print(f"\nHistory saved → {HISTORY_PATH}")

    html_body = build_email_html(results, today, history)
    badge_count = sum(1 for r in results if r["best_seller"])
    subject = (
        f"Amazon Best Seller Report {today} "
        f"– {badge_count}/{len(results)} badges active"
    )
    send_email(subject, html_body)


if __name__ == "__main__":
    main()
