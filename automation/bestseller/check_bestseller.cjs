#!/usr/bin/env node
/**
 * Amazon Best Seller Badge Checker
 * Checks 3 product listings daily and appends results to history.json.
 * Requires www.amazon.com in the environment's network egress allowlist.
 * Usage: node check_bestseller.cjs
 * Stdout: JSON { date, results[] }
 */

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const HISTORY_FILE = path.join(__dirname, 'history.json');

const PRODUCTS = [
  {
    name: 'GK0486-Master',
    url: 'https://www.amazon.com/dp/B08L8VZHKR?th=1',
  },
  {
    name: 'PN10-Master',
    url: 'https://www.amazon.com/dp/B004MZMBC4?th=1',
  },
  {
    name: 'PL6328-Master',
    url: 'https://www.amazon.com/dp/B0785J3B94?th=1',
  },
];

async function checkProduct(page, product) {
  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const result = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';
      const bodyHTML = document.body ? document.body.innerHTML : '';

      // Detect proxy/network block pages
      if (
        bodyText.includes('not in allowlist') ||
        bodyText.includes('Host not in allowlist') ||
        bodyText.includes('Access Denied')
      ) {
        return { blocked: true, hasBestSeller: null, snippet: null, title: null };
      }

      // Detect Amazon bot/CAPTCHA pages
      if (
        bodyText.includes('Enter the characters you see below') ||
        bodyText.includes('Type the characters you see in this image') ||
        bodyText.includes('Sorry, we just need to make sure')
      ) {
        return { blocked: false, hasBestSeller: null, snippet: null, title: 'CAPTCHA', captcha: true };
      }

      const hasBestSeller =
        /\bbest\s*seller\b/i.test(bodyText) ||
        /#1\s*best\s*seller/i.test(bodyHTML);

      const match = bodyText.match(/#?1?\s*best\s*seller[^\n]{0,80}/i);
      const snippet = match ? match[0].trim() : null;

      const titleEl = document.getElementById('productTitle');
      const title = titleEl ? titleEl.innerText.trim().substring(0, 120) : null;

      return { blocked: false, hasBestSeller, snippet, title };
    });

    if (result.blocked) {
      return { name: product.name, url: product.url, status: 'BLOCKED', hasBestSeller: null, title: null, snippet: null, error: 'Network egress blocked — add www.amazon.com to allowlist' };
    }
    if (result.captcha) {
      return { name: product.name, url: product.url, status: 'CAPTCHA', hasBestSeller: null, title: null, snippet: null, error: 'Amazon bot detection triggered' };
    }

    return {
      name: product.name,
      url: product.url,
      hasBestSeller: result.hasBestSeller,
      status: result.hasBestSeller ? 'YES' : 'NO',
      snippet: result.snippet,
      title: result.title,
      error: null,
    };
  } catch (err) {
    return {
      name: product.name,
      url: product.url,
      hasBestSeller: null,
      status: 'ERROR',
      snippet: null,
      title: null,
      error: err.message.split('\n')[0],
    };
  }
}

async function main() {
  const today = new Date().toISOString().split('T')[0];

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  const page = await context.newPage();
  const results = [];

  for (const product of PRODUCTS) {
    process.stderr.write(`Checking ${product.name}...\n`);
    const result = await checkProduct(page, product);
    results.push({ ...result, date: today });
    process.stderr.write(`  -> ${result.status}${result.error ? ' (' + result.error + ')' : ''}\n`);
  }

  await browser.close();

  // Load + update history
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (_) {}
  }
  history = history.filter((e) => e.date !== today);
  history.push(...results);

  // Keep last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  history = history.filter((e) => e.date >= cutoffStr);

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  console.log(JSON.stringify({ date: today, results }));
}

main().catch((err) => {
  process.stderr.write('FATAL: ' + err.message + '\n');
  process.exit(1);
});
