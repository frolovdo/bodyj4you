/**
 * Checks each Amazon listing for the "Best Seller" badge and appends results
 * to history.json.  Prints a JSON array of today's results to stdout.
 *
 * Usage:  node check-badges.js
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, 'history.json');

const PRODUCTS = [
  {
    name: 'GK0486-Master',
    url:  'https://www.amazon.com/dp/B08L8VZHKR?th=1',
    link: 'https://www.amazon.com/dp/B08L8VZHKR',
  },
  {
    name: 'PN10-Master',
    url:  'https://www.amazon.com/dp/B004MZMBC4?th=1',
    link: 'https://www.amazon.com/dp/B004MZMBC4',
  },
  {
    name: 'PL6328-Master',
    url:  'https://www.amazon.com/dp/B0785J3B94?th=1&psc=1',
    link: 'https://www.amazon.com/dp/B0785J3B94',
  },
];

// Returns true if the #1 Best Seller badge (orange ribbon near title) is visible.
// Deliberately avoids the "Best Sellers Rank" line in product details.
async function hasBestSellerBadge(page) {
  return page.evaluate(() => {
    // 1. Dedicated badge container Amazon uses for the orange ribbon
    const bsPos = document.querySelector('#best-seller-position, #bestseller-badge');
    if (bsPos && bsPos.textContent.toLowerCase().includes('best seller')) return true;

    // 2. Badge label elements (modern Amazon layout)
    const labels = document.querySelectorAll('i.badge-label, span.badge-label, .badge-status-text');
    for (const el of labels) {
      if (el.textContent.trim().toLowerCase().includes('best seller')) return true;
    }

    // 3. Any element whose class mentions "best-seller" (layout-independent)
    const bsEls = document.querySelectorAll('[class*="best-seller"], [id*="best-seller"], [class*="bestSeller"], [id*="bestSeller"]');
    for (const el of bsEls) {
      // Skip the "Best Sellers Rank" row in the product details table
      if (el.closest('#productDetails_detailBullets_sections1, #detailBulletsWrapper_feature_div, .prodDetTable')) continue;
      if (el.textContent.toLowerCase().includes('best seller')) return true;
    }

    // 4. alt/title on badge images
    const imgs = document.querySelectorAll('img[alt*="Best Seller"], img[title*="Best Seller"]');
    if (imgs.length > 0) return true;

    return false;
  });
}

async function main() {
  // Use system Chromium when running inside the Claude Code environment,
  // fall back to the playwright-managed browser elsewhere (GitHub Actions).
  const systemChromium = '/opt/pw-browsers/chromium';
  const launchOptions = {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  };
  if (existsSync(systemChromium)) launchOptions.executablePath = systemChromium;

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const today = new Date().toISOString().split('T')[0];
  const results = [];

  for (const product of PRODUCTS) {
    let status = 'ERROR';
    let errorMsg = null;
    try {
      await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      // Brief pause to let lazy-loaded badge elements render
      await page.waitForTimeout(3000);
      const badge = await hasBestSellerBadge(page);
      status = badge ? 'YES' : 'NO';
    } catch (err) {
      errorMsg = err.message.split('\n')[0];
    }

    const entry = { date: today, name: product.name, url: product.link, bestSeller: status };
    if (errorMsg) entry.error = errorMsg;
    results.push(entry);
    process.stderr.write(`  ${product.name}: ${status}${errorMsg ? ' (' + errorMsg + ')' : ''}\n`);
  }

  await browser.close();

  // Append to history
  const history = existsSync(HISTORY_FILE)
    ? JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
    : [];
  history.push(...results);
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + '\n');

  // Stdout → consumed by send-email.js or the caller
  console.log(JSON.stringify(results));
}

main().catch(err => { console.error(err); process.exit(1); });
