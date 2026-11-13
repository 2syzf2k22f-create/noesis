create table noesis.screentime_apps (id uuid primary key default gen_random_uuid(), day date not null default current_date, app text not null, minutes int not null, source text, created_at timestamptz not null default now(), updated_at timestamptz);
create index on noesis.screentime_apps (day);
alter table noesis.screentime_apps enable row level security;
grant all on noesis.screentime_apps to service_role;
