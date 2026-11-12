-- Phases 8-11: school, stats/reports, mind sports, languages, library.
-- Language vocab uses the same flashcards table (deck = language) so one SRS engine serves both.
-- Same lock-down as before: RLS on, no policies; only the server/relay (secret key) can access.

create extension if not exists vector;

create table noesis.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  board text,
  options text,              -- e.g. Further Maths options / Physics optional topic (undecided for now)
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
insert into noesis.subjects (name, board) values
  ('Maths', 'OCR'), ('Further Maths', 'OCR'), ('Physics', 'AQA'), ('Economics', 'Pearson Edexcel');

create table noesis.spec_topics (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  code text,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.sources (
  id uuid primary key default gen_random_uuid(),
  url text,
  title text,
  kind text,                 -- web | onenote | upload
  subject text, board text, topic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.note_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references noesis.sources on delete cascade,
  source_title text,
  idx int,
  text text not null,
  subject text, board text, topic text,
  embedding vector(384),     -- filled by the relay's embedding model later
  created_at timestamptz not null default now()
);
create index on noesis.note_chunks (subject);

create table noesis.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck text not null,        -- subject or language
  topic text,
  front text not null,
  back text not null,
  due_at timestamptz,
  interval_days numeric not null default 0,
  ease numeric not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  last_grade int,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on noesis.flashcards (deck, due_at);

create table noesis.reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references noesis.flashcards on delete cascade,
  deck text,
  grade int not null,
  interval_days numeric,
  created_at timestamptz not null default now()
);
create index on noesis.reviews (created_at);

create table noesis.study_sessions (
  id uuid primary key default gen_random_uuid(),
  subject text, topic text, label text,
  minutes numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on noesis.study_sessions (created_at);

create table noesis.resource_links (
  id uuid primary key default gen_random_uuid(),
  title text not null, url text not null, subject text, topic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.homework (
  id uuid primary key default gen_random_uuid(),
  title text not null, subject text, due_at timestamptz, status text not null default 'to do', source text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null, subject text, due_at timestamptz, link text, source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.quiz_results (
  id uuid primary key default gen_random_uuid(),
  subject text, topic text, score numeric, total numeric,
  created_at timestamptz not null default now()
);

create table noesis.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null, url text not null unique, summary text, subject text, deadline date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week date not null unique,
  title text, overall int, grade text, scores jsonb, commentary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.books (
  id uuid primary key default gen_random_uuid(),
  title text not null, author text, pages int, status text not null default 'to read', rating int,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.reading_logs (
  id uuid primary key default gen_random_uuid(),
  book text, book_id uuid references noesis.books on delete set null, pages int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.journal_entries (
  id uuid primary key default gen_random_uuid(),
  text text not null, mood text,
  shareable boolean not null default false,  -- private by default: Apollo never sees unshared entries
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.chess_games (
  id uuid primary key default gen_random_uuid(),
  url text unique, time_class text, color text, result text, rating int, opponent text, opponent_rating int, pgn text,
  created_at timestamptz not null default now()
);
create table noesis.chess_ratings (
  id uuid primary key default gen_random_uuid(),
  time_class text not null, rating int not null,
  created_at timestamptz not null default now()
);
create table noesis.chess_evals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references noesis.chess_games on delete cascade, ply int, fen text, eval_cp int, best_move text,
  created_at timestamptz not null default now()
);

create table noesis.poker_sessions (
  id uuid primary key default gen_random_uuid(),
  game text, buy_in numeric, cash_out numeric, profit numeric, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table noesis.poker_hands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references noesis.poker_sessions on delete cascade, hand text, notes text,
  created_at timestamptz not null default now()
);

create table noesis.geo_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text, item text, answer text, correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table noesis.brain_test_results (
  id uuid primary key default gen_random_uuid(),
  test text not null, score numeric not null, unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table noesis.memory_sessions (
  id uuid primary key default gen_random_uuid(),
  kind text, score numeric, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table noesis.coding_stats (
  id uuid primary key default gen_random_uuid(),
  platform text not null, rating int, max_rating int, solved int, rank text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'noesis' loop
    execute format('alter table noesis.%I enable row level security', t);
  end loop;
end $$;
grant all on all tables in schema noesis to service_role;
