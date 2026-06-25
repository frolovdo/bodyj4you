/**
 * Reads today's results from history.json and sends a report email.
 *
 * Required env vars:
 *   GMAIL_USER          – the Gmail address used to send (frolovdo@gmail.com)
 *   GMAIL_APP_PASSWORD  – Gmail App Password (not the account password)
 *   SEND_TO             – recipient address
 */

import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, 'history.json');

const { GMAIL_USER, GMAIL_APP_PASSWORD, SEND_TO } = process.env;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !SEND_TO) {
  console.error('Missing GMAIL_USER, GMAIL_APP_PASSWORD, or SEND_TO environment variables.');
  process.exit(1);
}

const history = existsSync(HISTORY_FILE)
  ? JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
  : [];

const today = new Date().toISOString().split('T')[0];
const todayResults = history.filter(r => r.date === today);

if (todayResults.length === 0) {
  console.error('No results for today found in history.json – did check-badges.js run first?');
  process.exit(1);
}

// Build a recent-history table (last 30 days per product)
const products = [...new Set(history.map(r => r.name))];
const recentHistory = {};
for (const name of products) {
  recentHistory[name] = history
    .filter(r => r.name === name)
    .slice(-30)
    .reverse();
}

function badgeCell(status) {
  if (status === 'YES') return '<td style="text-align:center;background:#1a7a00;color:#fff;font-weight:bold;padding:4px 10px;">✅ YES</td>';
  if (status === 'NO')  return '<td style="text-align:center;background:#c0392b;color:#fff;padding:4px 10px;">❌ NO</td>';
  return '<td style="text-align:center;color:#888;padding:4px 10px;">⚠️ ERROR</td>';
}

const todayRows = todayResults.map(r => `
  <tr>
    <td style="padding:8px 14px;font-weight:bold;">
      <a href="${r.url}" style="color:#0066c0;text-decoration:none;">${r.name}</a>
    </td>
    <td style="padding:8px 14px;">${r.date}</td>
    ${badgeCell(r.bestSeller)}
  </tr>`).join('');

const historyRows = products.map(name => {
  const entries = recentHistory[name] || [];
  const cells = entries.slice(0, 14).map(e =>
    `<td title="${e.date}" style="width:18px;text-align:center;font-size:11px;padding:2px;">${e.bestSeller === 'YES' ? '🟢' : e.bestSeller === 'NO' ? '🔴' : '⚠️'}</td>`
  ).join('');
  return `<tr><td style="padding:4px 10px;font-size:12px;">${name}</td>${cells}</tr>`;
}).join('');

const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:640px;margin:auto;">
  <h2 style="color:#232f3e;">📦 Amazon Best Seller Badge Report — ${today}</h2>

  <table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin-bottom:28px;">
    <thead>
      <tr style="background:#f0f0f0;">
        <th style="padding:8px 14px;text-align:left;">Product</th>
        <th style="padding:8px 14px;text-align:left;">Date</th>
        <th style="padding:8px 14px;text-align:center;">Best Seller?</th>
      </tr>
    </thead>
    <tbody>${todayRows}</tbody>
  </table>

  <h3 style="color:#232f3e;font-size:14px;">📅 Recent History (newest → oldest, 🟢=YES 🔴=NO)</h3>
  <table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;">
    ${historyRows}
  </table>

  <p style="color:#888;font-size:11px;margin-top:24px;">
    Checked automatically every day by the Amazon Badge Monitor workflow.<br>
    Reply to this email if you want to change the products or schedule.
  </p>
</body>
</html>`;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

const yesCount = todayResults.filter(r => r.bestSeller === 'YES').length;
const subjectTag = yesCount === todayResults.length ? '🏆 All Best Sellers' :
                   yesCount > 0 ? `⚠️ ${yesCount}/${todayResults.length} Best Sellers` :
                   '❌ No Best Sellers';

await transporter.sendMail({
  from: `"Badge Monitor" <${GMAIL_USER}>`,
  to: SEND_TO,
  subject: `Amazon Badge Report ${today} — ${subjectTag}`,
  html: htmlBody,
});

console.log(`Email sent to ${SEND_TO}`);
