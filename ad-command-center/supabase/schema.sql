-- Ad Command Center: Supabase schema (Postgres). One family per row where it matters, so a second product family can join later.
-- Everything the Mac tool kept in files lives here: users, sessions, audit, the change queue with backups and rollbacks, hypotheses,
-- the hourly schedule, cached datasets from the refresh jobs, and the refresh status with self-checks.

create extension if not exists pgcrypto;

-- people: the PIN is the identity (PBKDF2 hash + salt, same scheme as the Mac tool)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null check (role in ('viewer','analyst','approver','owner')),
  pin_salt text not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  csrf text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists login_attempts (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  ip text
);

create table if not exists audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_name text,
  role text,
  action text not null,
  item text,
  detail text
);

-- the change queue: one row per staged change set (what the Mac tool kept as queue/items/*.json)
create table if not exists queue_items (
  id text primary key,                         -- UI-20261012-232416-DENIS
  family text not null,
  kind text not null default 'change',
  title text not null,
  status text not null check (status in ('proposed','approved','applied','failed','rejected','deferred')),
  lever text,
  intent text,
  hypothesis text,
  stop_rule text,
  proposed_by text,
  approver text,
  approved_at timestamptz,
  applied_at timestamptz,
  override_note text,
  rows jsonb not null default '[]',            -- the change rows (api, campaign, target, body, change, why)
  prechecks jsonb not null default '[]',
  evidence jsonb not null default '[]',
  notes jsonb not null default '[]',
  result text,
  undoes text[],                                -- for a restore: the item ids it puts back
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- what was actually sent, one row per API row (the Mac tool's changes/applied_log.csv)
create table if not exists applied_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  item_id text references queue_items(id),
  api text not null,
  campaign text,
  target text,
  change text,
  why text,
  status text not null,
  entity_id text,
  error text
);

-- before-state and the exact undo rows for every send
create table if not exists backups (
  item_id text primary key references queue_items(id),
  taken_at timestamptz not null default now(),
  before_state jsonb not null,
  rollback_rows jsonb not null
);

-- a hypothesis per changed campaign, with the numbers at the time, for the verdict later
create table if not exists hypotheses (
  id bigserial primary key,
  item_id text references queue_items(id),
  family text not null,
  campaign text not null,
  by_user text,
  at timestamptz not null default now(),
  hypothesis text not null,
  success text not null default 'orders_up',
  review_days int not null default 14,
  review_on date,
  baseline jsonb not null,
  changes jsonb not null default '[]',
  reverted_at timestamptz,
  verdict text,
  note text
);

-- the hourly bid schedule (dayparting). base holds the bids the schedule moves from.
create table if not exists schedules (
  family text primary key,
  enabled boolean not null default false,
  by_user text,
  at timestamptz,
  campaigns jsonb not null default '{}',
  restored_at timestamptz,
  last_run_at timestamptz,
  last_run_note text
);

create table if not exists daypart_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  mode text not null,
  campaign text,
  entity text,
  entity_id text,
  from_bid numeric,
  to_bid numeric,
  mult numeric,
  status text,
  error text
);

-- cached datasets produced by the refresh jobs: one row per (family, name), payload as JSON
create table if not exists datasets (
  family text not null,
  name text not null,                           -- out_of_budget, searchterms, halo, placement, hourly_history, elasticity, rank, sqp, amc, price, competitors, change_history, live_state, daily, targets
  payload jsonb not null,
  data_through date,
  rows int,
  produced_at timestamptz not null default now(),
  produced_by text,
  primary key (family, name)
);

-- refresh status and self-checks, one row per source
create table if not exists refresh_status (
  family text not null,
  source text not null,
  state text not null,                          -- ok | failed | running | never
  ok_at timestamptz,
  failed_at timestamptz,
  seconds int,
  check_level text,                             -- ok | warn | fail
  check_msg text,
  primary key (family, source)
);

-- family configuration that lived in family.json / managed.json / charter.json
create table if not exists families (
  family text primary key,
  ads_profile_id text not null,
  asins text[] not null,
  managed jsonb not null,                       -- campaigns with jobs, targets, break-even and target ACoS
  charter jsonb not null,                       -- approvers, budget ceilings, change rules, floors, lock windows
  updated_at timestamptz not null default now()
);

create index if not exists audit_at on audit(at desc);
create index if not exists applied_log_at on applied_log(at desc);
create index if not exists queue_status on queue_items(family, status);
create index if not exists hyp_item on hypotheses(item_id);

-- Row level security: the browser never touches these tables directly; only the service role (Netlify functions) does.
alter table users enable row level security;
alter table sessions enable row level security;
alter table audit enable row level security;
alter table queue_items enable row level security;
alter table applied_log enable row level security;
alter table backups enable row level security;
alter table hypotheses enable row level security;
alter table schedules enable row level security;
alter table daypart_log enable row level security;
alter table datasets enable row level security;
alter table refresh_status enable row level security;
alter table families enable row level security;
alter table login_attempts enable row level security;
