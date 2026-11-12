-- Planner, past papers, check-ins, opening drills, puzzles and game reviews.

create table noesis.plan_items (
  id uuid primary key default gen_random_uuid(),
  date date not null, subject text, topic text not null, minutes int, kind text,
  done boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index on noesis.plan_items (date);

create table noesis.past_papers (
  id uuid primary key default gen_random_uuid(),
  subject text, paper text not null, year text, marks numeric not null, total numeric not null,
  pct numeric,                                    -- marks / total, computed in code
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table noesis.past_paper_topics (
  id uuid primary key default gen_random_uuid(),
  subject text, topic text not null, marks numeric not null, total numeric not null, pct numeric,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table noesis.checkins (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'morning', energy int, mood text, note text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table noesis.opening_drills (
  id uuid primary key default gen_random_uuid(),
  opening text not null, name text, side text, mistakes int not null default 0, moves int,
  created_at timestamptz not null default now()
);

create table noesis.puzzle_attempts (
  id uuid primary key default gen_random_uuid(),
  source text, puzzle_id text, rating int, solved boolean not null, themes text,
  created_at timestamptz not null default now()
);

create table noesis.chess_puzzles (
  id uuid primary key default gen_random_uuid(),
  fen text not null, solution jsonb not null, note text, source text,
  created_at timestamptz not null default now()
);

alter table noesis.chess_games add column if not exists review jsonb;
alter table noesis.chess_games add column if not exists updated_at timestamptz;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'noesis' loop
    execute format('alter table noesis.%I enable row level security', t);
  end loop;
end $$;
grant all on all tables in schema noesis to service_role;
