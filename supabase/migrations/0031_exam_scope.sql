-- What exams actually ask about each spec statement (beyond its wording), filled by Apollo, used by lessons,
-- questions, flashcards and test revision so "not technically on the spec" exam staples aren't missed.
alter table noesis.spec_points add column if not exists exam_scope jsonb;
alter table noesis.spec_points add column if not exists exam_scope_at timestamptz;
