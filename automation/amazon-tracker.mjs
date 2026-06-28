// Amazon Best Seller Badge Tracker
// Checks 3 Amazon listings daily for the Best Seller badge,
// stores history in amazon-badge-history.json, and emails results.
//
// Required env vars:
//   GMAIL_SMTP_USER  — Gmail address to send from (e.g. you@gmail.com)
//   GMAIL_SMTP_PASS  — Gmail App Password (not your regular password)
//                      Generate at: myaccount.google.com → Security → App passwords

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(here, 'amazon-badge-history.json');
// Use the pre-installed Chromium in Claude Code remote envs; fall back to Playwright's default.
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const LISTINGS = [
  {
    url: 'https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1',
    name: 'GK0486-Master',
  },
  {
    url: 'https://www.amazon.com/dp/B004MZMBC4?th=1',
    name: 'PN10-Master',
  },
  {
    url: 'https://www.amazon.com/dp/B0785J3B94?th=1&psc=1',
    name: 'PL6328-Master',
  },
];

const EMAIL_TO = 'denis@bodyj4you.com';

async function checkBadge(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Wait for the page to fully render dynamic content
    await page.waitForTimeout(3000);

    const hasBadge = await page.evaluate(() => {
      const text = (el) => (el ? el.textContent.toLowerCase() : '');

      // Primary location: acBadge feature div
      if (text(document.querySelector('#acBadge_feature_div')).includes('best seller')) return true;
      if (text(document.querySelector('#acBadge_feature_div')).includes('#1 best seller')) return true;

      // Badge label elements
      const labels = document.querySelectorAll('.a-badge-label, .a-badge-text, .badge-label');
      for (const el of labels) {
        if (text(el).includes('best seller')) return true;
      }

      // Broader page scan for the badge ribbon
      const spans = document.querySelectorAll('span[class*="badge"], div[class*="badge"], .a-size-mini');
      for (const el of spans) {
        if (text(el).includes('best seller')) return true;
      }

      return false;
    });

    return hasBadge;
  } catch (err) {
    console.error(`Error checking ${url}: ${err.message}`);
    return null;
  }
}

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}

async function main() {
  const history = existsSync(HISTORY_FILE)
    ? JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
    : { checks: [] };

  const today = new Date().toISOString().slice(0, 10);

  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  // Only set executablePath if the binary actually exists (skipped on GitHub Actions)
  if (existsSync(CHROMIUM)) launchOpts.executablePath = CHROMIUM;

  const browser = await chromium.launch(launchOpts);

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  const results = [];

  for (const listing of LISTINGS) {
    const page = await context.newPage();
    console.log(`Checking ${listing.name}…`);

    const hasBadge = await checkBadge(page, listing.url);
    await page.close();

    const entry = { name: listing.name, url: listing.url, date: today, bestSeller: hasBadge };
    results.push(entry);
    history.checks.push(entry);

    const label = hasBadge === null ? 'ERROR' : hasBadge ? 'YES' : 'NO';
    console.log(`  → ${label}`);

    // Polite delay between requests
    await new Promise((r) => setTimeout(r, 4000));
  }

  await browser.close();

  // Persist history
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`History saved to ${HISTORY_FILE}`);

  // ── Email ───────────────────────────────────────────────────────────────────
  const gmailUser = process.env.GMAIL_SMTP_USER;
  const gmailPass = process.env.GMAIL_SMTP_PASS;

  if (!gmailUser || !gmailPass) {
    console.warn('Skipping email: set GMAIL_SMTP_USER and GMAIL_SMTP_PASS env vars.');
    return;
  }

  const rows = results
    .map((r) => {
      const badge =
        r.bestSeller === null
          ? '<span style="color:#888">ERROR</span>'
          : r.bestSeller
          ? '<span style="color:#1a7f1a;font-weight:bold">YES ✅</span>'
          : '<span style="color:#c0392b;font-weight:bold">NO ❌</span>';
      return `
        <tr>
          <td style="padding:8px 12px"><a href="${r.url}" style="color:#0066c0;text-decoration:none">${r.name}</a></td>
          <td style="padding:8px 12px;text-align:center">${formatDate(r.date)}</td>
          <td style="padding:8px 12px;text-align:center">${badge}</td>
        </tr>`;
    })
    .join('');

  // Last 7 days of history for context
  const recent = history.checks.slice(-30);
  const histRows = recent
    .slice()
    .reverse()
    .map((r) => {
      const badge =
        r.bestSeller === null ? 'ERROR' : r.bestSeller ? 'YES' : 'NO';
      return `<tr>
        <td style="padding:4px 10px;color:#555">${r.name}</td>
        <td style="padding:4px 10px;color:#555;text-align:center">${formatDate(r.date)}</td>
        <td style="padding:4px 10px;text-align:center;color:${r.bestSeller ? '#1a7f1a' : r.bestSeller === null ? '#888' : '#c0392b'}">${badge}</td>
      </tr>`;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto">
  <h2 style="color:#232f3e">Amazon Best Seller Badge Report</h2>
  <p style="color:#555">Date: <strong>${formatDate(today)}</strong></p>

  <table border="0" cellpadding="0" cellspacing="0"
         style="border-collapse:collapse;width:100%;border:1px solid #ddd;border-radius:6px">
    <thead>
      <tr style="background:#232f3e;color:#fff">
        <th style="padding:10px 12px;text-align:left">Product</th>
        <th style="padding:10px 12px">Date</th>
        <th style="padding:10px 12px">Best Seller?</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <h3 style="margin-top:32px;color:#232f3e">Recent History (last 30 checks)</h3>
  <table border="0" cellpadding="0" cellspacing="0"
         style="border-collapse:collapse;width:100%;border:1px solid #eee;font-size:13px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 10px;text-align:left">Product</th>
        <th style="padding:6px 10px">Date</th>
        <th style="padding:6px 10px">Badge</th>
      </tr>
    </thead>
    <tbody>
      ${histRows}
    </tbody>
  </table>
</body>
</html>`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from: gmailUser,
    to: EMAIL_TO,
    subject: `Amazon Best Seller Report — ${formatDate(today)}`,
    html,
  });

  console.log(`Email sent to ${EMAIL_TO}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
