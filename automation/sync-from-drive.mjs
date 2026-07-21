// Drive-pipeline compute step.
//
// Every cron tick:
//   1. List the IN folder, pick the newest FBA file.
//   2. List the Miami OUT folder, find its newest modifiedTime.
//   3. If IN file is newer than the newest Miami output → run the skill
//      (python reorder.py) → upload Reorder_Miami_<MM.DD.YY>.xlsx and
//      Reorder_China_<MM.DD.YY>.xlsx to their respective OUT folders.
//   4. Otherwise → no-op.
//
// No marker file, no retries, no double-checks. If anything fails, the next
// cron run handles it.
//
// Auth: a service account JSON in env GDRIVE_SA_KEY, with Viewer on IN and
// Editor on both OUT folders.

import { google } from 'googleapis';
import { mkdirSync, writeFileSync, readFileSync, createReadStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));

const IN_FOLDER     = process.env.IN_FOLDER     || '19-AoS9nM3nm702v9tw15LWQGAT2c4xQr';   // 00_IN_FBA
const OUT_MIAMI     = process.env.OUT_MIAMI     || '1LgVtREkBxLcrrFdhkc4TTplzZhH0gu1U';   // 01_OUT_MIAMI
const OUT_CHINA     = process.env.OUT_CHINA     || '1MBGCoI4yTltZdRlnOHcpl9pg5ZaubluF';   // 02_OUT_CHINA
const PYTHON        = process.env.PYTHON        || 'python3';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const JSON_MIME = 'application/json';
const LOCK_NAME = 'velocity_lock.json';   // lives in OUT_MIAMI, read by the daily job

function authDrive() {
  const keyJson = process.env.GDRIVE_SA_KEY;
  if (!keyJson) throw new Error('GDRIVE_SA_KEY env var is not set.');
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function newestInFolder(drive, folderId, { startsWith, by = 'modifiedTime' } = {}) {
  // `by` controls which timestamp to sort by. For IN folder use modifiedTime
  // (so a re-uploaded file with new content is detected). For OUT comparison
  // use createdTime — that way renaming/touching OUT files can't fool us into
  // thinking the pipeline already ran for the latest input.
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: `${by} desc`,
    pageSize: 50,
    fields: 'files(id,name,modifiedTime,createdTime,mimeType,size)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let files = res.data.files || [];
  if (startsWith) files = files.filter(f => f.name.startsWith(startsWith));
  return files[0] || null;
}

async function downloadFile(drive, file, dest) {
  const res = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  writeFileSync(dest, Buffer.from(res.data));
}

async function uploadFile(drive, { folderId, name, path }) {
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId], mimeType: XLSX_MIME },
    media: { mimeType: XLSX_MIME, body: createReadStream(path) },
    supportsAllDrives: true,
    fields: 'id,name,modifiedTime',
  });
  return res.data;
}

// Upload the velocity lock, replacing the existing one in place so the daily
// job always finds it at a stable (folder, name). The lock is what freezes
// velocity: it is written ONLY here (weekly FBA processing), never by the
// daily Helium10 refresh.
async function uploadOrReplaceLock(drive, { folderId, name, path, mimeType }) {
  const listed = await drive.files.list({
    q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = (listed.data.files || [])[0];
  if (existing) {
    const res = await drive.files.update({
      fileId: existing.id,
      media: { mimeType, body: createReadStream(path) },
      supportsAllDrives: true,
      fields: 'id,name,modifiedTime',
    });
    return { ...res.data, replaced: true };
  }
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId], mimeType },
    media: { mimeType, body: createReadStream(path) },
    supportsAllDrives: true,
    fields: 'id,name,modifiedTime',
  });
  return { ...res.data, replaced: false };
}

// Read the snapshot date from the FBA csv. The file is the source of truth — we
// never substitute today's date or anything else. Returns MM.DD.YY, or throws.
// Handles both Sellerboard exports (column `date` / `snapshot-date`, format
// M/D/YYYY) and the original Amazon FBA Inventory export (column
// `Inventory age snapshot date`, format YYYY-MM-DD).
function fbaSnapshotLabel(csvPath) {
  const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error('FBA file has no data rows.');

  // Strip CSV quoting and BOM so 'snapshot-date' and '"snapshot-date"' both match.
  const clean = (s) => s.replace(/^﻿/, '').replace(/^"(.*)"$/, '$1').trim();
  const headers  = lines[0].split(',').map((h) => clean(h).toLowerCase());
  const firstRow = lines[1].split(',').map(clean);

  const candidates = ['snapshot-date', 'date', 'snapshot date', 'inventory age snapshot date'];
  let idx = -1;
  let matched;
  for (const c of candidates) {
    idx = headers.indexOf(c);
    if (idx >= 0) { matched = c; break; }
  }
  if (idx < 0) {
    throw new Error(
      `Could not find a snapshot-date column in the FBA file. ` +
      `Looked for: ${candidates.join(', ')}. Headers: ${headers.slice(0, 8).join(',')}…`
    );
  }
  const raw = firstRow[idx] || '';
  if (!raw) throw new Error(`Snapshot-date column "${matched}" is empty in the first row.`);

  // YYYY-MM-DD
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}.${m[3]}.${m[1].slice(2)}`;

  // M/D/YYYY  or MM/DD/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')}.${m[3].slice(2)}`;

  // M/D/YY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')}.${m[3]}`;

  throw new Error(`Couldn't parse snapshot date "${raw}" from column "${matched}".`);
}

async function main() {
  const drive = authDrive();

  const newestIn = await newestInFolder(drive, IN_FOLDER);
  if (!newestIn) {
    console.log('IN folder is empty. Nothing to do.');
    return;
  }
  console.log(`Newest IN file: ${newestIn.name} (${newestIn.modifiedTime})`);

  const newestMiami = await newestInFolder(drive, OUT_MIAMI, {
    startsWith: 'Reorder_Miami_',
    by: 'createdTime',
  });
  if (newestMiami) {
    console.log(`Newest Miami out (by createdTime): ${newestMiami.name} (created ${newestMiami.createdTime})`);
  } else {
    console.log('No Miami output yet.');
  }

  // IN modifiedTime vs OUT createdTime. Touching/renaming OUT files can't fool
  // this — only an actual upload of a fresh OUT advances the OUT clock.
  const inMs  = new Date(newestIn.modifiedTime).getTime();
  const outMs = newestMiami ? new Date(newestMiami.createdTime).getTime() : 0;

  if (inMs <= outMs) {
    console.log('Nothing newer in IN than in OUT_MIAMI. Done.');
    return;
  }

  // Download input
  const work = mkdirSync(join(tmpdir(), 'reorder-' + Date.now()), { recursive: true }) || join(tmpdir(), 'reorder-' + Date.now());
  const workDir = join(tmpdir(), 'reorder-' + process.pid + '-' + Date.now());
  mkdirSync(workDir, { recursive: true });

  const inputCsv = join(workDir, newestIn.name);
  await downloadFile(drive, newestIn, inputCsv);
  console.log('Downloaded input →', inputCsv);

  // Date label from the FBA snapshot date column. The file is the source of truth.
  let dateLabel = fbaSnapshotLabel(inputCsv);
  if (!dateLabel) { // (kept for legacy null-returns; the new code throws instead)
    const d = new Date();
    dateLabel = `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCFullYear()).slice(2)}`;
  }
  console.log('Snapshot date label:', dateLabel);

  // Run the skill twice (miami-xlsx + china-xlsx)
  const catalog = resolve(here, 'catalog.xlsx');
  const reorderPy = resolve(here, 'reorder.py');
  const miamiOut = join(workDir, `Reorder_Miami_${dateLabel}.xlsx`);
  const chinaOut = join(workDir, `Reorder_China_${dateLabel}.xlsx`);
  const lockOut  = join(workDir, LOCK_NAME);

  execFileSync(PYTHON, [reorderPy, catalog, inputCsv, 'miami-xlsx', miamiOut], { stdio: 'inherit' });
  execFileSync(PYTHON, [reorderPy, catalog, inputCsv, 'china-xlsx', chinaOut], { stdio: 'inherit' });
  // Freeze velocity for the daily Helium10 refresh. This is the ONLY place the
  // lock is (re)written — a full recount happens only on FBA upload.
  execFileSync(PYTHON, [reorderPy, catalog, inputCsv, 'velocity-lock', lockOut], { stdio: 'inherit' });

  if (!existsSync(miamiOut) || !existsSync(chinaOut) || !existsSync(lockOut)) {
    throw new Error('Skill did not produce expected output files.');
  }

  // Upload outputs
  const upMiami = await uploadFile(drive, {
    folderId: OUT_MIAMI,
    name: `Reorder_Miami_${dateLabel}.xlsx`,
    path: miamiOut,
  });
  console.log(`Uploaded Miami → ${upMiami.name} (${upMiami.id})`);

  const upChina = await uploadFile(drive, {
    folderId: OUT_CHINA,
    name: `Reorder_China_${dateLabel}.xlsx`,
    path: chinaOut,
  });
  console.log(`Uploaded China → ${upChina.name} (${upChina.id})`);

  const upLock = await uploadOrReplaceLock(drive, {
    folderId: OUT_MIAMI,
    name: LOCK_NAME,
    path: lockOut,
    mimeType: JSON_MIME,
  });
  console.log(`${upLock.replaced ? 'Replaced' : 'Created'} velocity lock → ${upLock.name} (${upLock.id})`);

  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
