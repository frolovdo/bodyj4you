// Auto-load the newest reorder xlsx from a Google Drive folder.
//
// Browser-only OAuth via Google Identity Services (GIS) token flow + Drive REST API v3.
// No backend, no stored secrets. The OAuth Client ID is public by design.
//
// Configure via Vite env vars (see .env.example):
//   VITE_GOOGLE_CLIENT_ID  - OAuth 2.0 Web client ID from Google Cloud Console
//   VITE_DRIVE_FOLDER_ID   - the Drive folder containing the weekly reorder files
//   VITE_DRIVE_FILE_PREFIX - optional name filter, e.g. "Reorder_Miami"
//
// When VITE_GOOGLE_CLIENT_ID or VITE_DRIVE_FOLDER_ID are absent, isDriveConfigured()
// returns false and the UI hides the Drive button — the app still works via upload.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID || '';
const FILE_PREFIX = import.meta.env.VITE_DRIVE_FILE_PREFIX || '';

let gisPromise = null;
let tokenClient = null;
let accessToken = sessionStorage.getItem('gdrive_token') || null;
let tokenExpiry = Number(sessionStorage.getItem('gdrive_token_exp') || 0);

export function isDriveConfigured() {
  return !!(CLIENT_ID && FOLDER_ID);
}

export function hasCachedToken() {
  return !!accessToken && Date.now() < tokenExpiry - 60_000;
}

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// interactive=false attempts a silent token grant (works only if the user has already
// consented and has an active Google session). interactive=true shows the consent popup
// and MUST be triggered from a user gesture (click).
async function getToken(interactive) {
  if (hasCachedToken()) return accessToken;
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        try {
          sessionStorage.setItem('gdrive_token', accessToken);
          sessionStorage.setItem('gdrive_token_exp', String(tokenExpiry));
        } catch { /* sessionStorage may be unavailable */ }
        resolve(accessToken);
      },
      error_callback: (err) => reject(new Error(err?.message || 'Google sign-in was cancelled')),
    });
    tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}

async function driveFetch(url, token) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 401 || resp.status === 403) {
    // token stale / insufficient — clear cache so next attempt re-consents
    accessToken = null;
    tokenExpiry = 0;
    sessionStorage.removeItem('gdrive_token');
    sessionStorage.removeItem('gdrive_token_exp');
    throw new Error(`Google Drive rejected the request (${resp.status}). Please connect again.`);
  }
  if (!resp.ok) throw new Error(`Google Drive request failed (${resp.status})`);
  return resp;
}

// Returns a File built from the newest matching xlsx in the configured folder.
export async function loadLatestFromDrive({ interactive = true } = {}) {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured');
  const token = await getToken(interactive);

  const q = [
    `'${FOLDER_ID}' in parents`,
    'trashed = false',
    `mimeType = '${XLSX_MIME}'`,
  ].join(' and ');

  const params = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '50',
    fields: 'files(id,name,modifiedTime)',
    spaces: 'drive',
  });
  const listResp = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  const { files } = await listResp.json();

  let candidates = files || [];
  if (FILE_PREFIX) {
    candidates = candidates.filter(f => f.name.startsWith(FILE_PREFIX));
  }
  if (candidates.length === 0) {
    throw new Error(
      FILE_PREFIX
        ? `No "${FILE_PREFIX}*.xlsx" files found in the Drive folder`
        : 'No .xlsx files found in the Drive folder'
    );
  }

  const newest = candidates[0]; // already sorted modifiedTime desc
  const dlResp = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${newest.id}?alt=media`,
    token
  );
  const ab = await dlResp.arrayBuffer();
  return new File([ab], newest.name, {
    type: XLSX_MIME,
    lastModified: new Date(newest.modifiedTime).getTime(),
  });
}
