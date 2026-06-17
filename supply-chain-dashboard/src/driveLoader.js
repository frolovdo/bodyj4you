// Data is hosted at the monorepo root in /data/supply-chain/, NOT inside
// this React app's public/ folder. The browser fetches it directly from
// GitHub's raw CDN, which means Drive drops never need to rebuild the
// dashboard.
//
// - raw.githubusercontent.com serves with CORS open for public repos
// - 5-minute Fastly cache is fine for an hourly-updated dataset
// - 5,000 req/hour rate limit per IP is well above any plausible usage

const REPO = 'frolovdo/bodyj4you'
const BRANCH = 'main'
const PATH = 'data/supply-chain'
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`

export async function loadManifest() {
  const url = `${RAW}/manifest.json`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`manifest.json not found (${r.status}) at ${url}`)
  return r.json()
}

export async function loadSnapshot(filename) {
  const url = `${RAW}/archive/${encodeURIComponent(filename)}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to load ${filename} (${r.status}).`)
  return r.arrayBuffer()
}
