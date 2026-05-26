// Bundle a reorder xlsx as the dashboard's startup snapshot.
//
//   node scripts/set-snapshot.mjs "C:/path/to/Reorder_Miami_06.01.26.xlsx"
//   npm run build
//
// Copies the file into public/data/latest.xlsx and regenerates public/data/manifest.json.
// The snapshot date label is parsed from the filename (NN.NN.NN); falls back to the file mtime.

import { copyFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '..', 'public', 'data');

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/set-snapshot.mjs <path-to-xlsx>');
  process.exit(1);
}

const filename = basename(src);
const st = statSync(src);

// Parse NN.NN.NN (or NN_NN_NN / NN-NN-NN) from the filename.
const m = filename.match(/(\d{2})[._-](\d{2})[._-](\d{2,4})/);
let label = null;
let snapshotDate = null;
if (m) {
  label = `${m[1]}.${m[2]}.${m[3]}`;
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  snapshotDate = `${yyyy}-${m[1]}-${m[2]}`;
} else {
  const d = new Date(st.mtimeMs);
  label = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
  snapshotDate = d.toISOString().slice(0, 10);
}

mkdirSync(dataDir, { recursive: true });
copyFileSync(src, resolve(dataDir, 'latest.xlsx'));
const manifest = { filename, file: 'latest.xlsx', label, snapshotDate, modifiedMs: st.mtimeMs };
writeFileSync(resolve(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Snapshot set:', JSON.stringify(manifest, null, 2));
console.log('Now run: npm run build');
