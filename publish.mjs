// One-command publish for the BodyJ4You reorder dashboards.
//
//   node publish.mjs "<path to Reorder_Miami_*.xlsx>" "<path to Reorder_China_*.xlsx>"
//
// Order/labels don't matter — files are routed by their name ("Miami" / "China").
// For each: copies it into that dashboard's public/data/latest.xlsx, writes manifest.json
// (snapshot date parsed from the filename), then git add + commit + push. Netlify then
// auto-deploys both sites. If neither snapshot changed, it commits nothing.
//
// This is the "publish half" of Version 1 (the chat path): your skill produces the two
// reorder files, then this script puts them online.

import { copyFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = dirname(fileURLToPath(import.meta.url));

const GIT_NAME = process.env.GIT_AUTHOR_NAME || 'frolovdo';
const GIT_EMAIL = process.env.GIT_AUTHOR_EMAIL || 'frolovdo@gmail.com';

const TARGETS = [
  { app: 'miami-dashboard', match: 'miami', label: 'Miami' },
  { app: 'china-dashboard', match: 'china', label: 'China' },
];

function parseLabel(filename) {
  const m = filename.match(/(\d{2})[._-](\d{2})[._-](\d{2,4})/);
  if (!m) return { label: null, snapshotDate: null };
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return { label: `${m[1]}.${m[2]}.${m[3]}`, snapshotDate: `${yyyy}-${m[1]}-${m[2]}` };
}

function snapshot(app, srcPath) {
  const st = statSync(srcPath);
  const filename = basename(srcPath);
  const dataDir = resolve(repoRoot, app, 'public', 'data');
  mkdirSync(dataDir, { recursive: true });
  copyFileSync(srcPath, resolve(dataDir, 'latest.xlsx'));
  const { label, snapshotDate } = parseLabel(filename);
  const manifest = { filename, file: 'latest.xlsx', label, snapshotDate, modifiedMs: st.mtimeMs, source: 'skill' };
  writeFileSync(resolve(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { label, filename };
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', ...opts });
}

// ---- main ----
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node publish.mjs "<Reorder_Miami_*.xlsx>" "<Reorder_China_*.xlsx>"');
  process.exit(1);
}

const routed = {};
for (const a of args) {
  const name = basename(a).toLowerCase();
  const t = TARGETS.find(t => name.includes(t.match));
  if (!t) { console.error(`Can't tell if this is Miami or China: ${a}`); process.exit(1); }
  if (!existsSync(a)) { console.error(`File not found: ${a}`); process.exit(1); }
  routed[t.app] = a;
}

const results = [];
for (const t of TARGETS) {
  if (!routed[t.app]) { console.error(`Missing the ${t.label} file.`); process.exit(1); }
  const r = snapshot(t.app, routed[t.app]);
  results.push({ ...t, ...r });
  console.log(`[${t.label}] staged ${r.filename} (${r.label})`);
}

git(['add', 'miami-dashboard/public/data', 'china-dashboard/public/data']);

const staged = git(['diff', '--cached', '--name-only']).trim();
if (!staged) {
  console.log('No snapshot changes — nothing to publish.');
  process.exit(0);
}

const msg = `Publish reorder snapshots (Miami ${results[0].label}, China ${results[1].label})`;
git(['-c', `user.name=${GIT_NAME}`, '-c', `user.email=${GIT_EMAIL}`, 'commit', '-m', msg], { stdio: 'inherit' });
git(['push'], { stdio: 'inherit' });

console.log('\nPublished. Netlify is building — both sites update in ~1-3 min:');
console.log('  Miami: https://inventory-reorder-maimi.netlify.app');
console.log('  China: https://inventory-reorder-china.netlify.app');
