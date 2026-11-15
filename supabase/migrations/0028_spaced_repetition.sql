create table if not exists noesis.sr_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz,
  area text not null, kind text not null, source_table text, source_id text, direction text not null default '',
  deck text, topic text, spec_code text, payload jsonb not null default '{}',
  state text not null default 'new' check (state in ('new','learning','review','relearning')),
  stability double precision, difficulty double precision, due_at timestamptz, last_reviewed_at timestamptz,
  reps int not null default 0, lapses int not null default 0, step int not null default 0,
  history jsonb not null default '[]', suspended boolean not null default false, leech boolean not null default false,
  unique (kind, source_table, source_id, direction)
);
create index if not exists sr_items_due_idx on noesis.sr_items (area, kind, due_at) where not suspended;
create table if not exists noesis.sr_reviews (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  item_id uuid not null references noesis.sr_items(id) on delete cascade, area text, kind text, reviewed_at timestamptz not null default now(),
  rating int not null check (rating between 1 and 4), correct boolean, response_ms int, session_id uuid,
  interval_before double precision, interval_after double precision, mode text, answer text, item_before jsonb
);
create index if not exists sr_reviews_time_idx on noesis.sr_reviews (reviewed_at);
create table if not exists noesis.sr_sessions (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz,
  area text, kind text, deck text, mode text, started_at timestamptz not null default now(), ended_at timestamptz,
  end_reason text check (end_reason in ('finished','ended_early','abandoned','paused')),
  planned_count int, answered_count int not null default 0, correct_count int not null default 0, state jsonb
);
alter table noesis.sr_items enable row level security;
alter table noesis.sr_reviews enable row level security;
alter table noesis.sr_sessions enable row level security;