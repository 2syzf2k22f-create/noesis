-- Upcoming tests as a first-class feature: tests, their topics (spec codes, scope, exclusions), chapter maps,
-- in-page revision sessions; test-linked reminders, homework and plan items.
create table if not exists noesis.upcoming_tests (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz,
  title text not null, subject text not null, date date not null, start_time text, end_time text, room text, lesson_id uuid, week text,
  total_marks int, target_marks int, target_grade text,
  status text not null default 'upcoming' check (status in ('upcoming','done','missed','cancelled')),
  notes text, calculator_allowed boolean, format text, duration_min int,
  reminder_settings jsonb not null default '{"days_before":[7,3,1],"morning_of":"07:00","nudges":true}',
  result_marks numeric, result_grade text, school_test_id uuid, deleted_at timestamptz
);
create table if not exists noesis.upcoming_test_topics (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz,
  test_id uuid not null references noesis.upcoming_tests(id) on delete cascade,
  label text not null, chapter text, spec_codes text[] not null default '{}', scope_note text, excluded text,
  confidence int check (confidence between 1 and 5), result_marks numeric, result_total numeric, sort_order int
);
create table if not exists noesis.chapter_maps (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz,
  subject text not null, chapter text not null, label text, spec_codes text[] not null default '{}', scope_note text, unique (subject, chapter)
);
create table if not exists noesis.test_sessions (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz,
  test_id uuid not null references noesis.upcoming_tests(id) on delete cascade, topic_id uuid,
  status text not null default 'active', order_mode text default 'weakest', current_topic_id uuid,
  covered jsonb not null default '[]', scores jsonb not null default '{}', minutes int not null default 0, summary text
);
alter table noesis.upcoming_tests enable row level security;
alter table noesis.upcoming_test_topics enable row level security;
alter table noesis.chapter_maps enable row level security;
alter table noesis.test_sessions enable row level security;
alter table noesis.inbox_items add column if not exists test_id uuid;
alter table noesis.homework add column if not exists test_id uuid;
alter table noesis.plan_items add column if not exists test_id uuid;
-- (seed data: Maths chapter maps, the two 18 Nov assessments, and their reminders were applied directly)
