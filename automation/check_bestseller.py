"""
Daily Amazon Best Seller badge checker.
Reads history from data/bestseller_history.json, appends today's result,
then sends an HTML email summary to the configured recipient.

Required env vars:
  GMAIL_USER          – sender Gmail address (e.g. frolovdo@gmail.com)
  GMAIL_APP_PASSWORD  – Gmail App Password (16-char, spaces optional)
"""

import json
import os
import random
import smtplib
import sys
import time
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── configuration ────────────────────────────────────────────────────────────

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

HISTORY_FILE = Path(__file__).parent.parent / "data" / "bestseller_history.json"
EMAIL_TO = "denis@bodyj4you.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
}

# ── Amazon scraping ───────────────────────────────────────────────────────────

def _has_bestseller_badge(html: str) -> bool:
    """Return True if the page HTML contains a Best Seller badge."""
    soup = BeautifulSoup(html, "lxml")

    # Pattern 1: explicit badge text nodes
    for tag in soup.find_all(string=True):
        t = tag.strip()
        if t in ("#1 Best Seller", "Best Seller"):
            return True

    # Pattern 2: Amazon badge markup
    for elem in soup.find_all(class_=lambda c: c and "a-badge" in c):
        if "best seller" in elem.get_text(separator=" ").lower():
            return True

    # Pattern 3: rank widget that shows Best Seller ribbon
    for elem in soup.find_all(id=lambda i: i and "bestSeller" in i):
        return True

    # Pattern 4: raw text fallback (covers dynamically-rendered text baked in)
    lower = html.lower()
    if "#1 best seller" in lower:
        return True

    return False


def check_product(session: requests.Session, product: dict) -> dict:
    """Fetch the product page and return a result dict."""
    name = product["name"]
    url = product["url"]
    today = str(date.today())

    try:
        time.sleep(random.uniform(2, 5))   # polite delay + vary timing
        resp = session.get(url, headers=HEADERS, timeout=30, allow_redirects=True)
    except requests.RequestException as exc:
        print(f"  [{name}] request error: {exc}", file=sys.stderr)
        return {"name": name, "url": url, "date": today, "bestseller": None, "error": str(exc)}

    if resp.status_code != 200:
        print(f"  [{name}] HTTP {resp.status_code}", file=sys.stderr)
        return {"name": name, "url": url, "date": today, "bestseller": None, "error": f"HTTP {resp.status_code}"}

    # Detect CAPTCHA / robot-check page
    if "robot" in resp.url or "captcha" in resp.text.lower():
        print(f"  [{name}] blocked by CAPTCHA", file=sys.stderr)
        return {"name": name, "url": url, "date": today, "bestseller": None, "error": "CAPTCHA"}

    has_badge = _has_bestseller_badge(resp.text)
    print(f"  [{name}] Best Seller: {'YES' if has_badge else 'NO'}")
    return {"name": name, "url": url, "date": today, "bestseller": has_badge, "error": None}


# ── history management ────────────────────────────────────────────────────────

def load_history() -> dict:
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text())
    return {p["name"]: [] for p in PRODUCTS}


def save_history(history: dict) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2) + "\n")


def append_results(history: dict, results: list[dict]) -> dict:
    for r in results:
        name = r["name"]
        if name not in history:
            history[name] = []
        history[name].append({
            "date": r["date"],
            "bestseller": r["bestseller"],
            "error": r["error"],
        })
    return history


# ── email ─────────────────────────────────────────────────────────────────────

def _status_cell(result: dict) -> tuple[str, str]:
    """Return (text, colour) for the status cell."""
    if result["error"]:
        return f"ERROR: {result['error']}", "#888"
    return ("✅ YES", "#1a7a1a") if result["bestseller"] else ("❌ NO", "#b30000")


def build_email_html(results: list[dict], history: dict, today: str) -> str:
    # Today's summary rows
    today_rows = ""
    for r in results:
        status_text, colour = _status_cell(r)
        today_rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <a href="{r['url']}" style="color:#0066c0;text-decoration:none;">{r['name']}</a>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">{today}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{colour};font-weight:bold;">{status_text}</td>
        </tr>"""

    # Historical table (last 30 entries per product, most recent first)
    hist_rows = ""
    for product in PRODUCTS:
        name = product["name"]
        url = product["url"]
        entries = history.get(name, [])[-30:][::-1]
        for entry in entries:
            s_text, s_col = _status_cell(entry)
            hist_rows += f"""
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">
            <a href="{url}" style="color:#0066c0;text-decoration:none;">{name}</a>
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">{entry['date']}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:{s_col};">{s_text}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:680px;margin:0 auto;padding:20px;">

  <h2 style="color:#e47911;margin-bottom:4px;">Amazon Best Seller Report</h2>
  <p style="color:#666;margin-top:0;">{today}</p>

  <h3 style="border-bottom:2px solid #e47911;padding-bottom:6px;">Today's Status</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:30px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:8px 12px;text-align:left;">Product</th>
        <th style="padding:8px 12px;text-align:left;">Date</th>
        <th style="padding:8px 12px;text-align:left;">Best Seller?</th>
      </tr>
    </thead>
    <tbody>{today_rows}
    </tbody>
  </table>

  <h3 style="border-bottom:2px solid #ccc;padding-bottom:6px;">History (last 30 checks per product)</h3>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:8px 12px;text-align:left;">Product</th>
        <th style="padding:8px 12px;text-align:left;">Date</th>
        <th style="padding:8px 12px;text-align:left;">Best Seller?</th>
      </tr>
    </thead>
    <tbody>{hist_rows}
    </tbody>
  </table>

  <p style="color:#aaa;font-size:11px;margin-top:30px;">
    Sent automatically by the bodyj4you Best Seller monitor.
  </p>
</body>
</html>"""


def send_email(results: list[dict], history: dict, today: str) -> None:
    gmail_user = os.environ["GMAIL_USER"]
    app_password = os.environ["GMAIL_APP_PASSWORD"].replace(" ", "")

    subject = f"Amazon Best Seller Report – {today}"
    html_body = build_email_html(results, history, today)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = EMAIL_TO

    # Plain-text fallback
    plain_lines = [f"Amazon Best Seller Report – {today}", ""]
    for r in results:
        status = "ERROR" if r["error"] else ("YES" if r["bestseller"] else "NO")
        plain_lines.append(f"{r['name']}: {status}")
    msg.attach(MIMEText("\n".join(plain_lines), "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, app_password)
        server.sendmail(gmail_user, EMAIL_TO, msg.as_string())

    print(f"Email sent to {EMAIL_TO}")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    today = str(date.today())
    print(f"Checking Amazon listings for {today} …")

    session = requests.Session()
    results = [check_product(session, p) for p in PRODUCTS]

    history = load_history()
    history = append_results(history, results)
    save_history(history)
    print(f"History saved to {HISTORY_FILE}")

    send_email(results, history, today)


if __name__ == "__main__":
    main()
