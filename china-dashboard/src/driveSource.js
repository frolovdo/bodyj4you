// Drive-as-source: list xlsx files in the configured folder, fetch the chosen one,
// parse into { data, summary }. Uses an HTTP-referrer-restricted API key and a
// publicly-shared folder — no OAuth.
import * as XLSX from 'xlsx';
import { GAPI_KEY, FOLDER_ID, FILE_PREFIX, SHEET_NAME } from './config.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

function parseDate(name) {
  const m = name.match(/(\d{2})[._-](\d{2})[._-](\d{2,4})/);
  if (!m) return null;
  const yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
  return {
    label: `${m[1]}.${m[2]}.${m[3]}`,
    iso: `${yyyy}-${m[1]}-${m[2]}`,
  };
}

// List every snapshot in the folder, newest first. Filters by name prefix and
// keeps only files whose name contains a parseable date.
export async function listSnapshots() {
  const q = `'${FOLDER_ID}' in parents and trashed = false and (mimeType = '${XLSX_MIME}' or mimeType = '${SHEET_MIME}') and name contains '${FILE_PREFIX}'`;
  const url = `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '100',
    fields: 'files(id,name,modifiedTime,mimeType)',
    key: GAPI_KEY,
  })}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Drive list failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return (data.files || [])
    .filter((f) => f.name.startsWith(FILE_PREFIX))
    .map((f) => ({ ...f, date: parseDate(f.name) }))
    .filter((f) => f.date)
    .sort((a, b) => b.date.iso.localeCompare(a.date.iso));
}

// Download the file's bytes and parse the two sheets.
export async function fetchSnapshot(file) {
  let url;
  if (file.mimeType === SHEET_MIME) {
    url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?${new URLSearchParams({
      mimeType: XLSX_MIME,
      key: GAPI_KEY,
    })}`;
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${file.id}?${new URLSearchParams({
      alt: 'media',
      key: GAPI_KEY,
    })}`;
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Drive download failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const buf = await resp.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const dataSheet =
    wb.Sheets[SHEET_NAME] ||
    wb.Sheets[wb.SheetNames.find((n) => !/summary/i.test(n))] ||
    wb.Sheets[wb.SheetNames[0]];
  const summarySheet =
    wb.Sheets['Summary'] || wb.Sheets[wb.SheetNames.find((n) => /summary/i.test(n))];

  const data = XLSX.utils.sheet_to_json(dataSheet, { defval: '' });
  const summary = summarySheet
    ? XLSX.utils.sheet_to_json(summarySheet, { defval: '' })
    : [];

  return { data, summary };
}
