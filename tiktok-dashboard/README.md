# TikTok Shop dashboard

Daily TikTok Shop performance for BodyJ4You (US). Static page plus one data file,
every number comes from the TikTok Shop API, nothing is typed in by hand.

- `index.html` renders `data/dashboard.json`: snapshot tiles (yesterday, week to
  date, month to date), trend cards against the prior period, and a monthly table.
- `data/dashboard.json` is written by `~/tt-api/dash.py` on Denis's Mac.

## Refresh (automatic, 5am ET daily)

A launchd job on the Mac (`com.bodyj4you.tiktok-dashboard`) runs
`~/tt-api/deploy/refresh_and_deploy.sh`, which:

1. pulls daily shop analytics (GMV, orders, buyers, refunds, page views,
   impressions, GMV by video / live / product card), finance statements (fees,
   shipping cost, adjustments, payout) and new orders from the TikTok Shop API;
2. aggregates them into `data/dashboard.json`;
3. commits the new file to `main` in a dedicated worktree and pushes, which
   triggers this Netlify site to redeploy.

Logs: `~/.cache/ttapi/deploy.log`. The TikTok analytics API only looks back
about 180 days, but every pulled day is cached locally so the monthly table
keeps growing from April 2026 onward.

## Not included (no API source yet)

Ad spend (TikTok Business Ads API, separate authorization) and COGS.
