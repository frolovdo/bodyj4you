// Pull every "Miami Warehouse - MM.DD.YY.xlsx" file from a Google Drive folder
// into public/data/archive/, write public/data/manifest.json. The dashboard reads
// the manifest at runtime and serves the chosen file from /data/archive/.
//
// Local:  npm run sync          (reads .env at repo root)
// CI:     npm run sync:ci       (reads env vars directly, e.g. from GH Action)
//
// Env vars (both forms):
//   GDRIVE_FOLDER_ID   ID of the Drive folder the user drops Miami Warehouse files into
//   GDRIVE_SA_KEY      Service-account JSON, as a single string

import { google } from 'googleapis'
import {
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const NAME_CONTAINS = 'Miami Warehouse'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const dataDir = resolve(repoRoot, 'public', 'data')
const archiveDir = resolve(dataDir, 'archive')

// Parse MM.DD.YY (or MM-DD-YY / MM_DD_YY) anywhere in the filename.
function parseSnapshotDate(name) {
  const m = name.match(/(\d{1,2})[._\-](\d{1,2})[._\-](\d{2,4})/)
  if (!m) return { label: null, iso: null }
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  const yy = m[3]
  const yyyy = yy.length === 2 ? `20${yy}` : yy
  return { label: `${mm}.${dd}.${yy}`, iso: `${yyyy}-${mm}-${dd}` }
}

function safeFilename(name) {
  // Drive file names can contain characters illegal on Windows. Strip them.
  return name.replace(/[\\/<>:"|?*]/g, '_')
}

async function main() {
  const folderId = process.env.GDRIVE_FOLDER_ID
  const keyJson = process.env.GDRIVE_SA_KEY
  if (!folderId) throw new Error('GDRIVE_FOLDER_ID env var is required.')
  if (!keyJson) throw new Error('GDRIVE_SA_KEY env var is required (service-account JSON).')

  const credentials = JSON.parse(keyJson)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })

  const q = [
    `'${folderId}' in parents`,
    'trashed = false',
    `(mimeType = '${XLSX_MIME}' or mimeType = '${SHEET_MIME}')`,
    `name contains '${NAME_CONTAINS}'`,
  ].join(' and ')

  const list = await drive.files.list({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: 200,
    fields: 'files(id,name,modifiedTime,mimeType,size)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  const files = list.data.files || []
  if (!files.length) {
    console.log(`No files matching "${NAME_CONTAINS}" in folder ${folderId}.`)
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(
      resolve(dataDir, 'manifest.json'),
      JSON.stringify(
        { folderId, syncedAt: new Date().toISOString(), latest: null, files: [] },
        null,
        2,
      ) + '\n',
    )
    return
  }

  mkdirSync(archiveDir, { recursive: true })

  const entries = []
  const keep = new Set()

  for (const f of files) {
    const sd = parseSnapshotDate(f.name)
    const localBase = f.name.toLowerCase().endsWith('.xlsx') ? f.name : `${f.name}.xlsx`
    const localName = safeFilename(localBase)
    const dest = join(archiveDir, localName)
    const modifiedMs = new Date(f.modifiedTime).getTime()
    keep.add(localName)

    // Skip download when local file is current. We trust modifiedMs from a prior run
    // recorded in the manifest, but the on-disk mtime is a fine proxy too.
    let upToDate = false
    if (existsSync(dest)) {
      const localMs = statSync(dest).mtimeMs
      if (localMs >= modifiedMs) upToDate = true
    }

    if (!upToDate) {
      let buf
      if (f.mimeType === SHEET_MIME) {
        const r = await drive.files.export(
          { fileId: f.id, mimeType: XLSX_MIME },
          { responseType: 'arraybuffer' },
        )
        buf = Buffer.from(r.data)
      } else {
        const r = await drive.files.get(
          { fileId: f.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' },
        )
        buf = Buffer.from(r.data)
      }
      writeFileSync(dest, buf)
      // Stamp the mtime to Drive's modifiedTime so the next run can short-circuit.
      const t = new Date(modifiedMs)
      try {
        // utimes is best-effort; ignore if it fails (rare on weird filesystems)
        const fs = await import('node:fs/promises')
        await fs.utimes(dest, t, t)
      } catch {}
      console.log(`  downloaded ${localName} (${buf.length} bytes)`)
    } else {
      console.log(`  up to date  ${localName}`)
    }

    entries.push({
      filename: localName,
      displayName: f.name,
      label: sd.label,
      snapshotDate: sd.iso,
      modifiedMs,
      driveFileId: f.id,
      sizeBytes: existsSync(dest) ? statSync(dest).size : 0,
    })
  }

  // Sort: snapshot date desc, then modifiedMs desc. Files without a parsable date sink to the bottom.
  entries.sort((a, b) => {
    if (a.snapshotDate && b.snapshotDate) return b.snapshotDate.localeCompare(a.snapshotDate)
    if (a.snapshotDate) return -1
    if (b.snapshotDate) return 1
    return b.modifiedMs - a.modifiedMs
  })

  // Prune local archive files no longer present in Drive.
  for (const name of readdirSync(archiveDir)) {
    if (!keep.has(name)) {
      unlinkSync(join(archiveDir, name))
      console.log(`  pruned      ${name}`)
    }
  }

  const manifest = {
    folderId,
    syncedAt: new Date().toISOString(),
    latest: entries[0]?.filename || null,
    files: entries,
  }
  writeFileSync(resolve(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Synced ${entries.length} file(s). Latest: ${manifest.latest}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
