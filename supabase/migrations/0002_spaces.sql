-- Phase 7 spaces: projects, fitness, nutrition and sleep. Same lock-down as 0001
-- (RLS on, no policies; only the server and relay, via the secret key, can read or write).

create table noesis.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'idea',
  summary text,
  link text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.project_notes (
  id uuid primary key default gen_random_uuid(),
  project text,
  project_id uuid references noesis.projects on delete set null,
  text text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references noesis.projects on delete cascade,
  title text,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  routine text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  exercises jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.workouts (
  id uuid primary key default gen_random_uuid(),
  routine text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references noesis.workouts on delete set null,
  routine text,
  exercise text not null,
  weight_kg numeric,
  reps int,
  volume numeric,          -- weight_kg * reps, computed in code on write
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on noesis.sets (created_at);

create table noesis.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  servings numeric,
  kcal numeric,
  protein_g numeric,
  tags text,
  ingredients text,
  steps text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references noesis.recipes on delete cascade,
  name text not null,
  amount text,
  created_at timestamptz not null default now()
);

create table noesis.meals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  recipe_id uuid references noesis.recipes on delete set null,
  kcal numeric,
  protein_g numeric,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on noesis.meals (created_at);

create table noesis.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  hours numeric not null,
  quality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table noesis.screentime_days (
  id uuid primary key default gen_random_uuid(),
  day date not null default current_date,
  minutes int not null,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'noesis' loop
    execute format('alter table noesis.%I enable row level security', t);
  end loop;
end $$;
grant all on all tables in schema noesis to service_role;
