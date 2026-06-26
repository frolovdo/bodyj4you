"""Send the HTML report email via Gmail SMTP.

Required env vars:
  GMAIL_USERNAME      - sender address (e.g. frolovdo@gmail.com)
  GMAIL_APP_PASSWORD  - 16-char Google App Password (not regular password)
"""

import os
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

REPORT_FILE = Path(__file__).parent / 'report.html'
TO_ADDRESS = 'denis@bodyj4you.com'


def main():
    username = os.environ.get('GMAIL_USERNAME', '').strip()
    password = os.environ.get('GMAIL_APP_PASSWORD', '').strip()

    if not username or not password:
        print('ERROR: GMAIL_USERNAME and GMAIL_APP_PASSWORD env vars are required.')
        sys.exit(1)

    if not REPORT_FILE.exists():
        print(f'ERROR: {REPORT_FILE} not found — run check_bestseller.js first.')
        sys.exit(1)

    html_body = REPORT_FILE.read_text(encoding='utf-8')

    # Extract date from first RESULT line for subject
    date_str = 'Daily'
    log_input = sys.argv[1] if len(sys.argv) > 1 else ''
    for line in log_input.splitlines():
        if line.startswith('RESULT:'):
            parts = line.split('|')
            if len(parts) >= 2:
                date_str = parts[1].strip()
                break

    subject = f'Amazon Best Seller Report — {date_str}'

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = username
    msg['To'] = TO_ADDRESS
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    print(f'Sending email: {subject}')
    print(f'  From: {username}')
    print(f'  To:   {TO_ADDRESS}')

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
        smtp.login(username, password)
        smtp.sendmail(username, TO_ADDRESS, msg.as_string())

    print('Email sent successfully.')


if __name__ == '__main__':
    main()
