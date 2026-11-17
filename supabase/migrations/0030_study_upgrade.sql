-- Revision timetable (time slots, status, adaptive rescheduling), chunked lessons, rich notes,
-- cached chess puzzles (so puzzles work where lichess.org is blocked).
alter table noesis.plan_items add column if not exists start_time text;
alter table noesis.plan_items add column if not exists end_time text;
alter table noesis.plan_items add column if not exists method text;
alter table noesis.plan_items add column if not exists status text not null default 'planned';
alter table noesis.plan_items add column if not exists source text not null default 'manual';
alter table noesis.plan_items add column if not exists priority numeric;
alter table noesis.plan_items add column if not exists notes text;
alter table noesis.plan_items add column if not exists done_minutes int;
alter table noesis.plan_items add column if not exists locked boolean not null default false;
alter table noesis.plan_items add column if not exists moved_from date;
alter table noesis.plan_items add column if not exists reason text;
update noesis.plan_items set status = 'done' where done and status = 'planned';

create table if not exists noesis.lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz,
  subject text not null, topic text not null, mode text not null default 'teach', level text default 'a-level',
  codes text[] not null default '{}', chunks jsonb not null default '[]', idx int not null default 0,
  status text not null default 'active', conversation_id uuid, minutes int not null default 0, plan_item_id uuid, summary text
);
alter table noesis.lessons enable row level security;

alter table noesis.notes add column if not exists tags text[] not null default '{}';
alter table noesis.notes add column if not exists pinned boolean not null default false;
alter table noesis.notes add column if not exists links jsonb not null default '[]';
alter table noesis.notes add column if not exists template text;
alter table noesis.notes add column if not exists versions jsonb not null default '[]';
alter table noesis.notes add column if not exists lesson_date date;
alter table noesis.notes add column if not exists color text;
alter table noesis.notes add column if not exists review_at timestamptz;

create table if not exists noesis.puzzle_cache (
  id text primary key, created_at timestamptz not null default now(),
  fen text not null, solution jsonb not null, rating int, themes text[] not null default '{}', difficulty text, served int not null default 0
);
alter table noesis.puzzle_cache enable row level security;
create index if not exists puzzle_cache_themes on noesis.puzzle_cache using gin (themes);
alter publication supabase_realtime add table noesis.jobs;
