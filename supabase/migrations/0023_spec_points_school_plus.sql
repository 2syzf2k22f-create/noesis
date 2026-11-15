-- Full specification content (School > Spec) and School features.
create table if not exists noesis.spec_points (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  subject text not null, board text,
  code text not null, title text, text text, notes text, examples text,
  level int not null default 4, parent_code text, sort_order int, paper text,
  optional boolean not null default false, chosen boolean not null default true,
  source_url text, source_version text, source_page int,
  verified boolean not null default false, verified_at timestamptz,
  previous_text text, changed_at timestamptz,
  confidence int check (confidence between 1 and 5), last_reviewed_at timestamptz,
  deleted_at timestamptz,
  unique (subject, code)
);
alter table noesis.spec_points enable row level security;
create index if not exists spec_points_parent_idx on noesis.spec_points (subject, parent_code);
-- existing spec_topics stay; their rows are copied in as unverified headings (linked by subject + code)
insert into noesis.spec_points (subject, code, title, level, parent_code, sort_order, verified, confidence, last_reviewed_at)
select t.subject, t.code, t.title, least(3, array_length(string_to_array(t.code, '.'), 1)),
  nullif(regexp_replace(t.code, '\.[^.]*$', ''), t.code), row_number() over (partition by t.subject order by t.code), false, t.confidence, t.last_reviewed
from noesis.spec_topics t where t.code is not null and t.code <> '' on conflict (subject, code) do nothing;
-- optional links from the rest of School to a spec statement
alter table noesis.flashcards add column if not exists spec_code text;
alter table noesis.questions add column if not exists spec_code text;
alter table noesis.notes add column if not exists spec_code text;
alter table noesis.mistakes add column if not exists spec_code text;
alter table noesis.mistakes add column if not exists kind text;
alter table noesis.school_tests add column if not exists spec_code text;
alter table noesis.past_paper_topics add column if not exists spec_code text;
alter table noesis.question_attempts add column if not exists spec_code text;
alter table noesis.plan_items add column if not exists spec_code text;
alter table noesis.study_sessions add column if not exists spec_code text;
alter table noesis.resource_links add column if not exists spec_code text;
create table if not exists noesis.blurts (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  subject text not null, spec_code text, recalled text, score int, missed text, feedback text
);
alter table noesis.blurts enable row level security;
