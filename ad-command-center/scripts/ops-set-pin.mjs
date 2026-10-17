// Set (or change) the PIN for the Ops page at /ops:   node scripts/ops-set-pin.mjs 123456
// Stores only a salted PBKDF2 hash in Supabase ops_auth and signs out every open Ops session.
// Reads SUPABASE_URL / SUPABASE_SERVICE_KEY from the environment, else ~/sp-api/.env.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const pin = process.argv[2] || '';
if (!/^\d{4,10}$/.test(pin)) { console.error('PIN must be 4-10 digits'); process.exit(1); }
const env = { ...process.env };
try {
  for (const line of fs.readFileSync(os.homedir() + '/sp-api/.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}
const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not found'); process.exit(1); }
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 200000, 32, 'sha256').toString('hex');
const h = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' };
let r = await fetch(url.replace(/\/$/, '') + '/rest/v1/ops_auth?on_conflict=id', { method: 'POST',
  headers: { ...h, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: 1, pin_hash: hash, pin_salt: salt, set_at: new Date().toISOString() }) });
if (!r.ok) { console.error('failed:', r.status, await r.text()); process.exit(1); }
await fetch(url.replace(/\/$/, '') + '/rest/v1/ops_sessions?token=neq.x', { method: 'DELETE', headers: h });
console.log('Ops PIN set. Open https://bodyj4you-ops-briefing.netlify.app');
