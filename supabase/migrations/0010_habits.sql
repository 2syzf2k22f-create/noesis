create table noesis.habits (id uuid primary key default gen_random_uuid(), name text not null, target_per_week int not null default 7, archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz);
create table noesis.habit_logs (id uuid primary key default gen_random_uuid(), habit_id uuid references noesis.habits on delete cascade, habit text, day date not null default current_date, created_at timestamptz not null default now());
create index on noesis.habit_logs (day);
alter table noesis.habits enable row level security;
alter table noesis.habit_logs enable row level security;
grant all on noesis.habits, noesis.habit_logs to service_role;
