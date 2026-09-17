-- JellyVid core schema.
-- Design note: the app never holds a Supabase service-role key. Every table is
-- RLS-locked with no policies, so the anon role can read nothing directly.
-- All access goes through SECURITY DEFINER functions that require the shared
-- app secret (JELLYVID_DB_SECRET), which only server routes hold. Credit math
-- therefore happens inside single SQL statements and can never race.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- config ---
create table if not exists jv_config (
  key   text primary key,
  value text not null
);
alter table jv_config enable row level security;

-- ----------------------------------------------------------------- enums ---
do $$ begin
  create type jv_ledger_kind as enum ('grant','purchase','spend','refund','adjustment','payout');
exception when duplicate_object then null; end $$;

do $$ begin
  create type jv_job_status as enum
    ('queued','in_progress','completed','failed','nsfw','canceled','timeout','duplicate');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables ---
create table if not exists jv_users (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  email              text unique,
  email_verified_at  timestamptz,
  recovery_code_hash text,
  signup_ip_hash     text,
  display_name       text,
  last_seen_at       timestamptz not null default now()
);
alter table jv_users enable row level security;
create index if not exists jv_users_ip_idx on jv_users (signup_ip_hash, created_at desc);

create table if not exists jv_wallets (
  user_id            uuid primary key references jv_users(id) on delete cascade,
  -- Credits never expire. There is deliberately no expiry column in this schema.
  balance_credits    integer not null default 0 check (balance_credits >= 0),
  lifetime_granted   integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_spent     integer not null default 0,
  lifetime_refunded  integer not null default 0,
  updated_at         timestamptz not null default now()
);
alter table jv_wallets enable row level security;

create table if not exists jv_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references jv_users(id) on delete cascade,
  kind           jv_ledger_kind not null,
  amount_credits integer not null,          -- signed: spends are negative
  balance_after  integer not null,
  reason         text not null,
  job_id         uuid,
  external_ref   text,                      -- stripe session id, etc.
  created_at     timestamptz not null default now()
);
alter table jv_ledger enable row level security;
create index if not exists jv_ledger_user_idx on jv_ledger (user_id, created_at desc);
create index if not exists jv_ledger_kind_idx on jv_ledger (kind, created_at desc);
create unique index if not exists jv_ledger_external_ref_idx
  on jv_ledger (external_ref) where external_ref is not null;
-- A job can only ever be refunded once.
create unique index if not exists jv_ledger_one_refund_per_job_idx
  on jv_ledger (job_id) where kind = 'refund';

create table if not exists jv_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references jv_users(id) on delete cascade,
  task                text not null,
  tier                text not null check (tier in ('draft','final')),
  kind                text not null check (kind in ('image','video')),
  model_id            text not null,
  endpoint            text not null,
  prompt              text not null,
  prompt_key          text not null,        -- normalised prompt, for duplicate detection
  params              jsonb not null default '{}'::jsonb,
  input_url           text,
  cost_credits        integer not null,
  status              jv_job_status not null default 'queued',
  provider_request_id text,
  provider_status_url text,
  provider_cancel_url text,
  output_url          text,
  stored_url          text,
  poster_url          text,
  phash               text,
  content_sha256      text,
  duplicate_of        uuid references jv_jobs(id) on delete set null,
  error_reason        text,
  error_code          text,
  consent_at          timestamptz,
  refunded            boolean not null default false,
  refund_reason       text,
  parent_job_id       uuid references jv_jobs(id) on delete set null,
  share_slug          text unique,
  is_public           boolean not null default false,
  attempts            integer not null default 0,
  submitted_at        timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table jv_jobs enable row level security;
create index if not exists jv_jobs_user_idx    on jv_jobs (user_id, created_at desc);
create index if not exists jv_jobs_status_idx  on jv_jobs (status, submitted_at);
create index if not exists jv_jobs_dupe_idx    on jv_jobs (user_id, prompt_key, status);

create table if not exists jv_events (
  id         bigserial primary key,
  user_id    uuid references jv_users(id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table jv_events enable row level security;
create index if not exists jv_events_name_idx on jv_events (name, created_at desc);

create table if not exists jv_payout_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references jv_users(id) on delete cascade,
  credits     integer not null,
  email       text,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);
alter table jv_payout_requests enable row level security;

create table if not exists jv_rate_limits (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);
alter table jv_rate_limits enable row level security;
