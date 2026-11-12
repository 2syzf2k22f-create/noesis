-- Question bank: real past-paper and generated exam questions with mark schemes, attempts and tests.
create table noesis.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null, board text, topic text, subtopic text,
  source text not null default 'generated',        -- past paper | generated | mine
  paper text, year text, number text,              -- for real past-paper questions
  question text not null, marks numeric not null default 1,
  mark_scheme text, answer text, difficulty int, tags text,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz
);
create index on noesis.questions (subject, topic);
create table noesis.tests (
  id uuid primary key default gen_random_uuid(),
  title text, subject text, topic text, question_ids jsonb not null default '[]',
  score numeric, total numeric, pct numeric, minutes numeric, status text not null default 'in progress',
  created_at timestamptz not null default now(), updated_at timestamptz
);
create table noesis.question_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references noesis.questions on delete cascade, test_id uuid references noesis.tests on delete set null,
  subject text, topic text, subtopic text, answer text,
  marks numeric, total numeric, pct numeric, marked_by text default 'self', feedback text, seconds int,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index on noesis.question_attempts (created_at);
alter table noesis.flashcards add column if not exists subtopic text;
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'noesis' loop execute format('alter table noesis.%I enable row level security', t); end loop; end $$;
grant all on all tables in schema noesis to service_role;
