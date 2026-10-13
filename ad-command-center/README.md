# Ad Command Center (online)

The online version of the rosehip Action Center: Dashboard, Update campaigns, Hourly, Keywords, History. React + Vite on Netlify,
Node functions for the API, Supabase for state. The engine on the Mac (`~/sp-api/adsops`) keeps running during the migration.

## Phases
- **0 (now):** PIN login online; the Mac pushes its rendered Dashboard and History into Supabase (`ac_push_supabase.py`), the site shows them with their age.
- **1:** Update campaigns and the send path in functions: live settings, preview, send with backup and read-back, restore, History from Supabase.
- **2:** Keywords, Hourly (schedule runner as a scheduled function), refresh jobs and self-checks in the cloud. Then the Mac is not needed.

## Netlify setup
- Site base directory: `ad-command-center`, build `npm run build`, publish `dist`, Node 20.
- Environment variables (Site settings → Environment variables): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADS_CLIENT_ID`, `ADS_CLIENT_SECRET`,
  `ADS_REFRESH_TOKEN`, `ADS_PROFILE_ID`, `ADS_REGION` (na), `AC_FAMILY` (EO-ROSEHIP). Never commit these.

## Supabase
Run `supabase/schema.sql` once in the SQL editor. The browser never talks to Supabase; only the functions do, with the service key.

## Local
`npm install`, then `npx netlify dev` with a `.env` holding the variables above (the file is git-ignored).
