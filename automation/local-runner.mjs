// Local job runner: runs on the Mac and does the work the dashboard buttons ask for.
//
// Dashboards add a row to Supabase `job_requests`; this script claims it, runs the job here,
// and writes done/failed back. Nothing runs on GitHub (see CLAUDE.md).
//
//   node local-runner.mjs            keep running: watch the queue (launchd starts this, see com.bodyj4you.runner.plist)
//   node local-runner.mjs run <job>  run one job now, without the queue
//
// Settings come from automation/.env (never committed):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY      same project as Ad Command Center
//   GDRIVE_SA_KEY                           service-account JSON on one line (reorder + supply chain)
//   SUPPLY_CHAIN_GDRIVE_FOLDER_ID           Drive folder for the supply chain sync
//   ENGINE_ALL_CMD, ENGINE_LIGHT_CMD        shell commands for the Ad Command Center engine run in ~/sp-api,
//                                           e.g. what refresh.yml ran for what=all / what=light
//   RUNNER_NAME                             optional, defaults to the host name

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { hostname, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
loadEnv(join(here, '.env'));

const POLL_MS = 10_000;
const JOB_TIMEOUT_MS = 60 * 60_000;
const RUNNER = process.env.RUNNER_NAME || hostname();

// Each job is a list of shell steps run in order; the first failure stops the job.
const JOBS = {
  reorder: () => [
    { cwd: here, cmd: 'npm install --no-audit --no-fund --silent' },
    { cwd: here, cmd: `${process.env.PYTHON || 'python3'} -m pip install -q -r requirements.txt` },
    { cwd: here, cmd: 'node sync-from-drive.mjs' },
  ],
  supply_chain: () => {
    const app = join(repo, 'supply-chain-dashboard');
    return [
      { cwd: app, cmd: 'npm ci --silent' },
      { cwd: app, cmd: 'npm run sync:ci', env: { GDRIVE_FOLDER_ID: process.env.SUPPLY_CHAIN_GDRIVE_FOLDER_ID || '' } },
      { cwd: repo, cmd: 'git add data/supply-chain && (git diff --staged --quiet || (git commit -q -m "Sync Supply Chain Dashboard snapshots" -- data/supply-chain && git pull -q --rebase origin main && git push -q origin HEAD:main))' },
    ];
  },
  engine_all: () => engine('ENGINE_ALL_CMD'),
  engine_light: () => engine('ENGINE_LIGHT_CMD'),
};

function engine(name) {
  const cmd = process.env[name];
  if (!cmd) throw new Error(`${name} is not set in automation/.env on ${RUNNER}, so the engine run could not start.`);
  return [{ cwd: process.env.ENGINE_DIR || join(homedir(), 'sp-api'), cmd }];
}

// ---------- Supabase (REST, service key) ----------
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}
const now = () => new Date().toISOString();
const heartbeat = () => sb('job_runners', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { name: RUNNER, seen_at: now(), jobs: Object.keys(JOBS) } });

// ---------- running ----------
function runStep({ cwd, cmd, env }, log) {
  return new Promise((ok, fail) => {
    log(`$ ${cmd}  (in ${cwd})`);
    const p = spawn(cmd, { cwd, shell: true, env: { ...process.env, ...env } });
    let tail = '';
    const keep = (d) => { const s = d.toString(); process.stdout.write(s); tail = (tail + s).slice(-1500); };
    p.stdout.on('data', keep); p.stderr.on('data', keep);
    const t = setTimeout(() => p.kill('SIGTERM'), JOB_TIMEOUT_MS);
    p.on('close', (code) => { clearTimeout(t); code === 0 ? ok(tail) : fail(new Error(`"${cmd}" exited with ${code}: ${tail.trim().split('\n').slice(-3).join(' | ')}`)); });
  });
}

async function runJob(job, log = console.log) {
  if (!JOBS[job]) throw new Error(`unknown job "${job}" (known: ${Object.keys(JOBS).join(', ')})`);
  let tail = '';
  for (const step of JOBS[job]()) tail = await runStep(step, log);
  const last = tail.trim().split('\n').filter(Boolean).pop() || '';
  return last.slice(0, 300) || 'Finished.';
}

async function claimNext() {
  const [next] = await sb(`job_requests?status=eq.requested&job=in.(${Object.keys(JOBS).join(',')})&order=id.asc&limit=1&select=id,job`);
  if (!next) return null;
  // Only one runner wins: the update matches only while the row is still 'requested'.
  const won = await sb(`job_requests?id=eq.${next.id}&status=eq.requested`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'running', runner: RUNNER, started_at: now() } });
  return won.length ? won[0] : null;
}

async function loop() {
  if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set in automation/.env'); process.exit(1); }
  // A job this runner was in the middle of when it stopped will not finish: say so.
  await sb(`job_requests?status=eq.running&runner=eq.${encodeURIComponent(RUNNER)}`, { method: 'PATCH', body: { status: 'failed', finished_at: now(), message: 'The Mac runner restarted before this job finished. Press the button again.' } });
  console.log(`local runner "${RUNNER}" watching job_requests for: ${Object.keys(JOBS).join(', ')}`);
  for (;;) {
    try {
      await heartbeat();
      const req = await claimNext();
      if (req) {
        console.log(`[${now()}] job ${req.id}: ${req.job}`);
        try {
          const message = await runJob(req.job);
          await sb(`job_requests?id=eq.${req.id}`, { method: 'PATCH', body: { status: 'done', finished_at: now(), message } });
          console.log(`[${now()}] job ${req.id} done`);
        } catch (e) {
          await sb(`job_requests?id=eq.${req.id}`, { method: 'PATCH', body: { status: 'failed', finished_at: now(), message: String(e.message || e).slice(0, 1000) } });
          console.error(`[${now()}] job ${req.id} failed: ${e.message || e}`);
        }
        continue;   // look for the next one straight away
      }
    } catch (e) {
      console.error(`[${now()}] ${e.message || e}`);   // network blip: try again next tick
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const [, , cmd, job] = process.argv;
if (cmd === 'run') {
  runJob(job).then((m) => console.log(`done: ${m}`), (e) => { console.error(`failed: ${e.message || e}`); process.exit(1); });
} else {
  loop();
}
