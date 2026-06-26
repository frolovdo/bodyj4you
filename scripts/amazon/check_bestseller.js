import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRODUCTS = [
  {
    name: 'GK0486-Master',
    url: 'https://www.amazon.com/dp/B08L8VZHKR/ref=twister_B07DT6KJWQ?_encoding=UTF8&th=1',
  },
  {
    name: 'PN10-Maste',
    url: 'https://www.amazon.com/dp/B004MZMBC4?th=1',
  },
  {
    name: 'PL6328-Master',
    url: 'https://www.amazon.com/dp/B0785J3B94?th=1&psc=1',
  },
];

const HISTORY_FILE = join(__dirname, 'history.json');
const REPORT_FILE = join(__dirname, 'report.html');

function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

async function checkBestSeller(page, product) {
  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      // Primary: dedicated badge section Amazon renders
      const badgeDiv = document.getElementById('acBadge_feature_div');
      if (badgeDiv) {
        const txt = badgeDiv.textContent || '';
        if (/best\s*seller/i.test(txt)) return { found: true, source: 'acBadge' };
      }

      // Secondary: any badge text element
      const badgeTexts = document.querySelectorAll(
        '.a-badge-text, [class*="badge-label"], [class*="bestseller"], [class*="best-seller"]'
      );
      for (const el of badgeTexts) {
        if (/best\s*seller/i.test(el.textContent || '')) {
          return { found: true, source: 'badge-text' };
        }
      }

      // Tertiary: leftNav or feature-name attribute
      const featureEl = document.querySelector('[data-feature-name="acBadge"]');
      if (featureEl && /best\s*seller/i.test(featureEl.textContent || '')) {
        return { found: true, source: 'feature-name' };
      }

      // Broad fallback — limit to above-the-fold area to avoid false positives in reviews
      const topSection = document.querySelector('#dp-container, #ppd, #centerCol');
      if (topSection) {
        const txt = topSection.textContent || '';
        if (/#1\s+best\s+seller/i.test(txt) || /best\s+seller\s+in/i.test(txt)) {
          return { found: true, source: 'text-search' };
        }
      }

      return { found: false, source: null };
    });

    return result.found;
  } catch (err) {
    console.error(`  Error on ${product.name}: ${err.message}`);
    return null;
  }
}

function buildHtml(today, results, history) {
  const statusBadge = (status) => {
    if (status === 'YES') return '<span style="color:#2e7d32;font-weight:bold">✅ YES</span>';
    if (status === 'NO') return '<span style="color:#c62828;font-weight:bold">❌ NO</span>';
    return '<span style="color:#f57f17;font-weight:bold">⚠️ ERROR</span>';
  };

  const todayRows = results.map(r => `
    <tr>
      <td><a href="${r.url}" style="color:#0645ad">${r.name}</a></td>
      <td>${today}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');

  // Last 30 days history table
  const last30 = history.slice(-30).reverse();
  const historyRows = last30.flatMap(entry =>
    entry.results.map(r => `
    <tr>
      <td><a href="${r.url}" style="color:#0645ad">${r.name}</a></td>
      <td>${entry.date}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`)
  ).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; max-width: 700px; margin: 20px auto; color: #333; }
  h2 { color: #232f3e; border-bottom: 2px solid #ff9900; padding-bottom: 8px; }
  h3 { color: #555; margin-top: 30px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; }
  th { background: #232f3e; color: #fff; padding: 10px 14px; text-align: left; }
  td { padding: 9px 14px; border-bottom: 1px solid #eee; }
  tr:hover td { background: #f9f9f9; }
</style>
</head>
<body>
<h2>Amazon Best Seller Report — ${today}</h2>

<h3>Today's Results</h3>
<table>
  <tr><th>Product</th><th>Date</th><th>Best Seller?</th></tr>
  ${todayRows}
</table>

<h3>History (last 30 days)</h3>
<table>
  <tr><th>Product</th><th>Date</th><th>Best Seller?</th></tr>
  ${historyRows}
</table>
</body>
</html>`;
}

async function main() {
  const today = new Date().toISOString().split('T')[0];
  const history = loadHistory();
  const results = [];

  console.log(`Amazon Best Seller check — ${today}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    const page = await context.newPage();

    for (const product of PRODUCTS) {
      process.stdout.write(`  ${product.name} ... `);
      const hasBadge = await checkBestSeller(page, product);
      const status = hasBadge === null ? 'ERROR' : hasBadge ? 'YES' : 'NO';
      console.log(status);

      results.push({ name: product.name, url: product.url, date: today, status });

      await page.waitForTimeout(4000);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // Update history (replace today's entry if re-running)
  const updatedHistory = history.filter(e => e.date !== today);
  updatedHistory.push({ date: today, results });
  saveHistory(updatedHistory);

  writeFileSync(REPORT_FILE, buildHtml(today, results, updatedHistory));

  console.log('\nSaved: history.json, report.html');

  // Print summary for CI logs
  for (const r of results) {
    console.log(`RESULT: ${r.name} | ${r.date} | ${r.status}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
