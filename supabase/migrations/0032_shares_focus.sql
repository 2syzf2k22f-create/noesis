-- Read-only share links (quiz, deck, document) and the PC focus-tracking job kind.
create table if not exists noesis.shares (
  token text primary key, created_at timestamptz not null default now(),
  kind text not null, ref_id text not null, title text, expires_at timestamptz, revoked boolean not null default false, views int not null default 0
);
alter table noesis.shares enable row level security;
alter table noesis.jobs drop constraint if exists jobs_kind_check;
alter table noesis.jobs add constraint jobs_kind_check check (kind = any (array['apollo','build','report','research','ship','rollback','stt','pc','pc_bg','pc_watch','focus_track']));
alter table noesis.shares add column if not exists id text unique;
