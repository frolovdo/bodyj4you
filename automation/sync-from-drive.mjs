// Sync the newest Reorder_Miami / Reorder_China file from the Drive output folder
// into each dashboard's public/data/ snapshot. Works with BOTH xlsx files (what the
// inventory-reorder skill uploads) and native Google Sheets. Idempotent — only writes
// when Drive has a newer file than what's already published.
//
// Runs in GitHub Actions on a cron (see .github/workflows/sync-reorder.yml). The
// workflow commits + pushes any changes, which makes Netlify redeploy.
//
// Auth: a Google service account JSON in env GDRIVE_SA_KEY. The service account needs
// read access to the Drive output folder.

import { google } from 'googleapis';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const OUTPUT_FOLDER_ID = process.env.DRIVE_OUTPUT_FOLDER_ID || '1LgVtREkBxLcrrFdhkc4TTplzZhH0gu1U';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const TARGETS = [
  { app: 'miami-dashboard', prefix: 'Reorder_Miami' },
  { app: 'china-dashboard', prefix: 'Reorder_China' },
];

function parseLabel(title) {
  // strip extension first so dates inside filenames parse cleanly
  const base = title.replace(/\.xlsx$/i, '');
  const m = base.match(/(\d{2})[._-](\d{2})[._-](\d{2,4})/);
  if (!m) return { label: null, snapshotDate: null };
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return { label: `${m[1]}.${m[2]}.${m[3]}`, snapshotDate: `${yyyy}-${m[1]}-${m[2]}` };
}

function readExistingManifest(dataDir) {
  const p = resolve(dataDir, 'manifest.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

async function fetchBytes(drive, file) {
  // Google Sheets need export → xlsx. Already-xlsx files use plain download.
  if (file.mimeType === SHEET_MIME) {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: XLSX_MIME },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data);
  }
  const res = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data);
}

async function main() {
  const keyJson = process.env.GDRIVE_SA_KEY;
  if (!keyJson) throw new Error('GDRIVE_SA_KEY env var is not set.');

  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  let changed = 0;

  for (const t of TARGETS) {
    // Accept BOTH xlsx and native Sheets — the skill may produce either.
    const q = [
      `'${OUTPUT_FOLDER_ID}' in parents`,
      'trashed = false',
      `(mimeType = '${XLSX_MIME}' or mimeType = '${SHEET_MIME}')`,
      `name contains '${t.prefix}'`,
    ].join(' and ');

    const list = await drive.files.list({
      q,
      orderBy: 'modifiedTime desc',
      pageSize: 20,
      fields: 'files(id,name,modifiedTime,mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    // Must start with the prefix (avoid 'name contains' false matches mid-string)
    const newest = (list.data.files || []).find(f => f.name.startsWith(t.prefix));
    if (!newest) {
      console.log(`[${t.app}] no "${t.prefix}*" file found in folder ${OUTPUT_FOLDER_ID}`);
      continue;
    }

    const dataDir = resolve(repoRoot, t.app, 'public', 'data');
    const existing = readExistingManifest(dataDir);
    const newestMs = new Date(newest.modifiedTime).getTime();

    if (existing && existing.driveFileId === newest.id && Number(existing.modifiedMs) >= newestMs) {
      console.log(`[${t.app}] already up to date (${newest.name})`);
      continue;
    }

    const buf = await fetchBytes(drive, newest);

    mkdirSync(dataDir, { recursive: true });
    writeFileSync(resolve(dataDir, 'latest.xlsx'), buf);

    const { label, snapshotDate } = parseLabel(newest.name);
    const manifest = {
      filename: newest.name.endsWith('.xlsx') ? newest.name : `${newest.name}.xlsx`,
      file: 'latest.xlsx',
      label,
      snapshotDate,
      modifiedMs: newestMs,
      driveFileId: newest.id,
      source: 'drive',
    };
    writeFileSync(resolve(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`[${t.app}] updated → ${newest.name} (${label}, ${newest.mimeType}, ${buf.length} bytes)`);
    changed++;
  }

  console.log(changed ? `Done. ${changed} snapshot(s) updated.` : 'Done. No changes.');
}

main().catch((e) => { console.error(e); process.exit(1); });
