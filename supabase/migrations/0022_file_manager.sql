-- Library > Files as a file manager. New columns are nullable / defaulted: existing files are unchanged.
alter table noesis.files
  add column if not exists starred boolean not null default false,
  add column if not exists folder text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists subject text,
  add column if not exists versions jsonb not null default '[]'::jsonb;
-- binary uploads (PDFs, images...) live in a private bucket; the server hands out short-lived signed links
insert into storage.buckets (id, name, public, file_size_limit) values ('files', 'files', false, 26214400) on conflict (id) do nothing;
