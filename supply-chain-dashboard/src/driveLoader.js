// Reads the manifest written by scripts/sync-from-drive.mjs and fetches a specific
// archived snapshot. Both files are served as static assets out of /data/.

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

export async function loadManifest() {
  const url = `${BASE}/data/manifest.json`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`manifest.json not found (${r.status}). Run "npm run sync" to populate it.`)
  return r.json()
}

export async function loadSnapshot(filename) {
  const url = `${BASE}/data/archive/${encodeURIComponent(filename)}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to load ${filename} (${r.status}).`)
  return r.arrayBuffer()
}
