-- Dashboard and subpages: timetable, events, notes, recovery, memory palaces, file contents.

create table noesis.timetable (
  id uuid primary key default gen_random_uuid(),
  day int not null check (day between 1 and 7),   -- 1 = Monday
  start text not null,                            -- "09:00"
  "end" text not null,
  subject text,
  room text,
  week text,                                      -- optional A/B week
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'event',             -- exam | deadline | event | trip
  at timestamptz not null,
  subject text,
  location text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on noesis.events (at);

create table noesis.notes (
  id uuid primary key default gen_random_uuid(),
  subject text,
  kind text not null default 'lesson',            -- lesson | topic
  topic text,
  title text not null,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  energy int, soreness int, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.palaces (
  id uuid primary key default gen_random_uuid(),
  palace text not null, position int, locus text not null, image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table noesis.routines add column if not exists day text;
alter table noesis.files add column if not exists content text;
alter table noesis.files add column if not exists project text;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'noesis' loop
    execute format('alter table noesis.%I enable row level security', t);
  end loop;
end $$;
grant all on all tables in schema noesis to service_role;
