#!/usr/bin/env python3
"""Daily Amazon Best Seller badge checker for bodyj4you products."""
import json
import os
import re
import smtplib
import time
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
from bs4 import BeautifulSoup

PRODUCTS = [
    {
        "name": "GK0486-Master",
        "url": "https://www.amazon.com/dp/B08L8VZHKR?th=1",
        "link": "https://www.amazon.com/dp/B08L8VZHKR",
    },
    {
        "name": "PN10-Master",
        "url": "https://www.amazon.com/dp/B004MZMBC4?th=1",
        "link": "https://www.amazon.com/dp/B004MZMBC4",
    },
    {
        "name": "PL6328-Master",
        "url": "https://www.amazon.com/dp/B0785J3B94?th=1&psc=1",
        "link": "https://www.amazon.com/dp/B0785J3B94",
    },
]

HISTORY_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bestseller_history.json"
)

# Browser-like headers to reduce bot detection
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


def load_history() -> dict:
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {p["name"]: [] for p in PRODUCTS}


def save_history(history: dict) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def check_best_seller(url: str) -> tuple:
    """Return (has_badge: bool | None, reason: str).  None means fetch error."""
    try:
        session = requests.Session()
        resp = session.get(url, headers=HEADERS, timeout=20)

        # Detect CAPTCHA / bot wall before any parse
        if (
            "api-services-support@amazon.com" in resp.text
            or "Type the characters you see" in resp.text
            or resp.status_code == 503
        ):
            return None, "CAPTCHA / bot-block"
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"

        soup = BeautifulSoup(resp.text, "html.parser")

        # Method 1: badge ribbon elements
        for badge in soup.select("i.a-badge, span.a-badge, .a-badge-label-inner, .a-badge-text"):
            if "best seller" in badge.get_text(strip=True).lower():
                return True, "badge element"

        # Method 2: '#1 Best Seller' in the main product column
        center = (
            soup.find(id="centerCol")
            or soup.find(id="dp-container")
            or soup.find(id="dp")
        )
        if center and re.search(r"#1\s+Best\s+Seller", center.get_text(), re.IGNORECASE):
            return True, "#1 in product column"

        # Method 3: sales rank section
        for elem_id in ("SalesRank", "bestsellersrank", "detailBulletsWrapper_feature_div"):
            elem = soup.find(id=elem_id)
            if elem and "#1" in elem.get_text():
                return True, f"#1 in {elem_id}"

        # Method 4: raw page source (last resort, avoids review text)
        if re.search(r'"isBestSeller"\s*:\s*true', resp.text):
            return True, "isBestSeller JSON flag"

        return False, "no badge found"

    except Exception as exc:
        return None, f"exception: {exc}"


def build_email_html(results: list, history: dict, today: str) -> str:
    # Today's results
    summary_rows = ""
    for r in results:
        if r["has_badge"] is None:
            label, bg = "⚠️ ERROR", "#fff3cd"
        elif r["has_badge"]:
            label, bg = "✅ YES", "#d4edda"
        else:
            label, bg = "❌ NO", "#f8d7da"

        summary_rows += (
            f'<tr style="background:{bg}">'
            f'<td style="padding:10px;border:1px solid #dee2e6">'
            f'<a href="{r["link"]}" style="font-weight:bold;color:#007bff">{r["name"]}</a></td>'
            f'<td style="padding:10px;border:1px solid #dee2e6;text-align:center">{today}</td>'
            f'<td style="padding:10px;border:1px solid #dee2e6;text-align:center;font-size:1.1em">{label}</td>'
            f'<td style="padding:10px;border:1px solid #dee2e6;color:#6c757d;font-size:0.85em">{r["reason"]}</td>'
            f"</tr>"
        )

    # History per product (last 7 days, newest first)
    history_section = ""
    for product in PRODUCTS:
        name = product["name"]
        entries = history.get(name, [])[-7:]
        if not entries:
            continue
        rows = ""
        for e in reversed(entries):
            if e["has_badge"] is None:
                b = "⚠️ ERROR"
            elif e["has_badge"]:
                b = "✅ YES"
            else:
                b = "❌ NO"
            rows += (
                f'<tr>'
                f'<td style="padding:6px;border:1px solid #dee2e6">{e["date"]}</td>'
                f'<td style="padding:6px;border:1px solid #dee2e6;text-align:center">{b}</td>'
                f'<td style="padding:6px;border:1px solid #dee2e6;color:#6c757d;font-size:0.8em">{e.get("reason","")}</td>'
                f"</tr>"
            )
        history_section += (
            f'<h3 style="margin-top:24px">'
            f'<a href="{product["link"]}" style="color:#343a40">{name}</a></h3>'
            f'<table style="border-collapse:collapse;font-family:sans-serif;font-size:0.9em">'
            f'<tr style="background:#495057;color:white">'
            f'<th style="padding:6px;border:1px solid #dee2e6">Date</th>'
            f'<th style="padding:6px;border:1px solid #dee2e6">Best Seller</th>'
            f'<th style="padding:6px;border:1px solid #dee2e6">Notes</th>'
            f"</tr>{rows}</table>"
        )

    return f"""<html>
<body style="font-family:sans-serif;max-width:800px;margin:auto;padding:20px">
  <h1 style="color:#343a40">Amazon Best Seller Badge Report</h1>
  <p style="color:#6c757d">Daily check — <strong>{today}</strong></p>

  <h2>Today's Results</h2>
  <table style="border-collapse:collapse;width:100%">
    <thead>
      <tr style="background:#343a40;color:white">
        <th style="padding:10px;border:1px solid #dee2e6;text-align:left">Product</th>
        <th style="padding:10px;border:1px solid #dee2e6">Date</th>
        <th style="padding:10px;border:1px solid #dee2e6">Best Seller?</th>
        <th style="padding:10px;border:1px solid #dee2e6;text-align:left">Notes</th>
      </tr>
    </thead>
    <tbody>{summary_rows}</tbody>
  </table>

  <hr style="margin:30px 0">
  <h2>Recent History (last 7 days)</h2>
  {history_section}

  <p style="color:#adb5bd;font-size:0.8em;margin-top:30px">
    Automated check by bodyj4you · runs daily via GitHub Actions
  </p>
</body>
</html>"""


def send_email(html_body: str, today: str) -> None:
    sender = os.environ.get("GMAIL_USER", "frolovdo@gmail.com")
    password = os.environ["GMAIL_APP_PASSWORD"]
    recipient = "denis@bodyj4you.com"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Amazon Best Seller Report – {today}"
    msg["From"] = sender
    msg["To"] = recipient
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(sender, password)
        smtp.sendmail(sender, recipient, msg.as_string())

    print(f"Email sent → {recipient}")


def main() -> None:
    today = str(date.today())
    history = load_history()
    results = []

    for product in PRODUCTS:
        name = product["name"]
        print(f"Checking {name} …")
        has_badge, reason = check_best_seller(product["url"])
        print(f"  has_badge={has_badge}  reason={reason!r}")

        entry = {"date": today, "has_badge": has_badge, "reason": reason}
        history.setdefault(name, []).append(entry)

        results.append(
            {"name": name, "link": product["link"], "has_badge": has_badge, "reason": reason}
        )
        time.sleep(3)  # polite delay between requests

    save_history(history)
    print("History saved.")

    html_body = build_email_html(results, history, today)
    send_email(html_body, today)


if __name__ == "__main__":
    main()
