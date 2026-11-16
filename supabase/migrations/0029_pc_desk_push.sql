-- Scheduled PC tasks (relay runs them), phone push tracking on inbox items.
create table if not exists noesis.pc_schedules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz,
  title text not null, kind text not null default 'command', command text, prompt text,
  days int[] not null default '{}', time text not null, enabled boolean not null default true, last_run_on text
);
alter table noesis.pc_schedules enable row level security;
alter table noesis.inbox_items add column if not exists pushed_at timestamptz;
update noesis.inbox_items set pushed_at = now() where pushed_at is null;
alter table noesis.jobs drop constraint if exists jobs_kind_check;
alter table noesis.jobs add constraint jobs_kind_check check (kind = any (array['apollo','build','report','research','ship','rollback','stt','pc','pc_bg','pc_watch']));
