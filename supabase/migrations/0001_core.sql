-- NOESIS core schema (spec section 12, "Core"), in its own schema so it can't collide
-- with anything already in the revision-hub project.
--
-- No app login (the site sits behind Netlify team login). So: RLS is ON for every table
-- with NO policies -> the public/anon key can read nothing. Only the server (Netlify
-- functions) and the relay use the secret key, which bypasses RLS.

create schema if not exists noesis;
create extension if not exists pgcrypto;

create table noesis.settings (
  id text primary key default 'main',
  theme_id text not null default 'midnight',
  theme_by_time boolean not null default false,
  model_pref text not null default 'auto',
  voice jsonb not null default '{}',
  nav jsonb not null default '[]',
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table noesis.themes (
  id text primary key,
  name text not null,
  tokens jsonb not null,
  version int not null default 1,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  space text,
  spec jsonb not null default '{}',
  version int not null default 1,
  pinned boolean not null default false,
  position int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references noesis.pages on delete cascade,
  version int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  unique (page_id, version)
);

create table noesis.widgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  spec jsonb not null default '{}',
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.profile_facts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table noesis.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  space text,
  project_id uuid,
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table noesis.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references noesis.conversations on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);
create index on noesis.messages (conversation_id, created_at);

create table noesis.chat_summaries (
  id uuid primary key references noesis.conversations on delete cascade, -- = conversation id
  summary text not null,
  upto_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table noesis.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('apollo', 'build', 'report', 'research', 'ship', 'rollback')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error', 'rate_limited', 'cancelled')),
  conversation_id uuid references noesis.conversations on delete set null,
  model text,
  input jsonb not null,
  output jsonb,
  ui_actions jsonb not null default '[]',
  error text,
  retry_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index on noesis.jobs (status, created_at);

create table noesis.relay_status (
  id text primary key default 'main',
  last_heartbeat timestamptz,
  version text,
  info jsonb not null default '{}'
);

create table noesis.usage_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references noesis.jobs on delete set null,
  feature text not null,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);
create index on noesis.usage_log (created_at);

create table noesis.action_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references noesis.jobs on delete set null,
  actor text not null default 'apollo',
  tool text not null,
  table_name text,
  row_id text,
  before jsonb,
  after jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index on noesis.action_log (created_at desc);

create table noesis.trash (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id text not null,
  data jsonb not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);

create table noesis.files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text,
  mime text,
  size_bytes bigint,
  project_id uuid,
  source text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.inbox_items (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  body text,
  link text,
  due_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Lock down: RLS on, no policies; only service_role (secret key) gets in.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'noesis' loop
    execute format('alter table noesis.%I enable row level security', t);
  end loop;
end $$;

revoke all on schema noesis from anon, authenticated;
grant usage on schema noesis to service_role;
grant all on all tables in schema noesis to service_role;
alter default privileges in schema noesis grant all on tables to service_role;

-- Starting memory, from the spec. Apollo keeps these up to date with remember_fact.
insert into noesis.settings (id) values ('main');
insert into noesis.profile_facts (key, value) values
  ('name', 'Reg'),
  ('age', 'under 18'),
  ('subjects', 'Maths (OCR), Further Maths (OCR), Physics (AQA), Economics (Pearson Edexcel)'),
  ('undecided', 'Further Maths options and the Physics optional topic'),
  ('languages', 'Mandarin (HSK 1), Spanish (from A1), French (GCSE 9, rusty), English vocabulary'),
  ('projects', 'Life dashboard (NOESIS), Touchline, Bluebird, RDsites, Programming'),
  ('training', 'push / pull / legs split'),
  ('poker', 'home games or play money only');
