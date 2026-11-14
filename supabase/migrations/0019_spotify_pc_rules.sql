-- Spotify sign-in (server-side only: Apollo's tools never read this table) and PC "always allow" rules.
create table if not exists noesis.integrations (
  id text primary key,                 -- 'spotify'
  data jsonb not null default '{}',    -- tokens live here; never sent to the browser or Apollo
  updated_at timestamptz not null default now()
);
alter table noesis.integrations enable row level security;

create table if not exists noesis.pc_allow_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text not null check (category in ('launch_app','open_website','media_keys','read_only','open_path','window_control')),
  pattern text not null,               -- "<category>: <normalised target>", never a wildcard over a raw command
  enabled boolean not null default true,
  uses integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (category, pattern)
);
alter table noesis.pc_allow_rules enable row level security;
