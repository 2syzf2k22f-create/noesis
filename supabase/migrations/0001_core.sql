-- NOESIS core schema (spec section 12, "Core").
-- NOT applied yet: creating/choosing the Supabase project and auth is the owner's call.
-- Single user. Every table has RLS: a row is visible only to the user who owns it.

create extension if not exists pgcrypto;

create table settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  theme_id text not null default 'midnight',
  theme_by_time boolean not null default false,
  model_pref text not null default 'auto',
  voice jsonb not null default '{}',
  nav jsonb not null default '[]',
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table themes (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  tokens jsonb not null,           -- css variables + orb theme object
  version int not null default 1,
  created_by text not null default 'user',  -- 'user' | 'apollo' | 'preset'
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text not null,
  title text not null,
  space text,
  spec jsonb not null,             -- JSON page spec (layout grid + components + bindings)
  version int not null default 1,
  pinned boolean not null default false,
  position int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table page_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  page_id uuid not null references pages on delete cascade,
  version int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  unique (page_id, version)
);

create table widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null,              -- library component name, or 'custom' (sandboxed iframe)
  spec jsonb not null,
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table profile_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text,
  space text,
  project_id uuid,
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  conversation_id uuid not null references conversations on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

create table chat_summaries (
  conversation_id uuid primary key references conversations on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  summary text not null,
  upto_message_id uuid,
  updated_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('apollo', 'build')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error', 'rate_limited', 'cancelled')),
  conversation_id uuid references conversations on delete set null,
  model text,
  input jsonb not null,
  output jsonb,
  error text,
  retry_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index on jobs (status, created_at);

create table relay_status (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  last_heartbeat timestamptz,
  version text,
  info jsonb not null default '{}'
);

create table usage_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  job_id uuid references jobs on delete set null,
  feature text not null,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);

-- Every Apollo write lands here with before/after, which is what makes Undo possible.
create table action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  job_id uuid references jobs on delete set null,
  actor text not null default 'apollo',
  tool text not null,
  table_name text,
  row_id text,
  before jsonb,
  after jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create table trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  table_name text not null,
  row_id text not null,
  data jsonb not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '30 days'
);

create table files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  storage_path text not null,
  mime text,
  size_bytes bigint,
  project_id uuid,
  source text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null,
  title text not null,
  body text,
  link text,
  due_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS on every table: owner only.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','themes','pages','page_versions','widgets','profile_facts','conversations',
    'messages','chat_summaries','jobs','relay_status','usage_log','action_log','trash',
    'files','inbox_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
