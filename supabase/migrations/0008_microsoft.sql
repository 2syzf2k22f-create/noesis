-- Microsoft 365 (school account): sign-in token, sync state, and external ids so synced rows update in place.
create table noesis.ms_auth (
  id text primary key default 'main',
  account text, refresh_token text, access_token text, expires_at timestamptz,
  scopes text, last_sync timestamptz, last_result jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz
);
alter table noesis.homework add column if not exists external_id text unique;
alter table noesis.homework add column if not exists link text;
alter table noesis.homework add column if not exists class_name text;
alter table noesis.homework add column if not exists points numeric;
alter table noesis.homework add column if not exists grade text;
alter table noesis.homework add column if not exists instructions text;
alter table noesis.events add column if not exists external_id text unique;
alter table noesis.events add column if not exists end_at timestamptz;
alter table noesis.events add column if not exists source text;
alter table noesis.inbox_items add column if not exists external_id text unique;
alter table noesis.notes add column if not exists external_id text unique;
alter table noesis.notes add column if not exists link text;
alter table noesis.notes add column if not exists source text;
alter table noesis.timetable add column if not exists source text;
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'noesis' loop execute format('alter table noesis.%I enable row level security', t); end loop; end $$;
grant all on all tables in schema noesis to service_role;
