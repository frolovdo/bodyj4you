# Amazon Best Seller Daily Monitor

Checks 3 Amazon listings daily for the Best Seller badge and emails results to denis@bodyj4you.com.

## Products monitored

| Name | URL |
|------|-----|
| GK0486-Master | https://www.amazon.com/dp/B08L8VZHKR |
| PN10-Master | https://www.amazon.com/dp/B004MZMBC4 |
| PL6328-Master | https://www.amazon.com/dp/B0785J3B94 |

## Required setup (one-time)

### 1. ScraperAPI key (for Amazon scraping)

Amazon blocks requests from cloud/datacenter IPs. ScraperAPI routes through residential proxies.

1. Sign up free at https://www.scraperapi.com/ — free tier gives 5,000 requests/month (enough for 3/day × 31 days = 93/month)
2. Copy your API key from the dashboard
3. In Claude Code on the web → Session Settings → Environment Variables, add:
   ```
   SCRAPERAPI_KEY = your_key_here
   ```

### 2. Gmail app password (for actual email sending)

Without this, the script creates a Gmail **draft** instead of sending. The draft appears in frolovdo@gmail.com's Drafts folder but is NOT delivered to denis@bodyj4you.com.

To enable actual sending:
1. Go to your Google Account → Security → 2-Step Verification (must be enabled)
2. Go to Security → App passwords
3. Create an app password for "Mail" / "Other"
4. In Claude Code Session Settings → Environment Variables, add:
   ```
   GMAIL_APP_PASSWORD = xxxx xxxx xxxx xxxx
   GMAIL_SENDER = frolovdo@gmail.com
   ```

## How it works

Each daily session:
1. Pulls latest repo
2. Runs `check_bestseller.py` — checks all 3 listings, saves to `history.json`
3. If `GMAIL_APP_PASSWORD` is set → sends email via Gmail SMTP
4. Otherwise → creates a Gmail draft (visible in frolovdo@gmail.com Drafts)
5. Commits updated `history.json` and pushes

## Files

- `check_bestseller.py` — main script
- `history.json` — persistent check history (all results, all dates)
- `DAILY_PROMPT.md` — instructions Claude follows each day
