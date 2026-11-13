-- Universities and courses (filled by Apollo's research with sources, or by you), meal plans, token totals.
create table noesis.unis (
  id uuid primary key default gen_random_uuid(), name text not null unique, city text, region text, country text default 'UK',
  lat numeric, lon numeric, setting text, russell_group boolean, founded int,
  students_total int, undergrads int, postgrads int, intl_pct numeric, female_pct numeric, state_school_pct numeric,
  satisfaction_pct numeric, continuation_pct numeric, graduate_prospects_pct numeric, employment_pct numeric, median_salary numeric,
  entry_tariff numeric, rank_cug int, rank_guardian int, rank_times int, rank_qs int,
  accommodation_cost_week numeric, living_cost_rating text, sports text, clubs text, website text, notes text,
  shortlisted boolean not null default false, rating int, sources jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz
);
create table noesis.courses (
  id uuid primary key default gen_random_uuid(), uni text not null, uni_id uuid references noesis.unis on delete set null, name text not null,
  ucas_code text, degree text, years numeric, typical_offer text, contextual_offer text, required_subjects text, admissions_test text, interview boolean,
  applicants_per_place numeric, offer_rate_pct numeric, intake int, satisfaction_pct numeric, teaching_pct numeric, employment_pct numeric,
  salary_15m numeric, salary_5y numeric, placement boolean, year_abroad boolean, fees_home numeric, modules text, assessment text, url text, notes text,
  status text not null default 'researching', rating int, sources jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index on noesis.courses (uni);
alter table noesis.opportunities add column if not exists kind text;
alter table noesis.opportunities add column if not exists uni text;
alter table noesis.opportunities add column if not exists author text;
alter table noesis.recipes add column if not exists rating int;
alter table noesis.recipes add column if not exists favourite boolean not null default false;
alter table noesis.recipes add column if not exists source text;
alter table noesis.recipes add column if not exists cuisine text;
alter table noesis.recipes add column if not exists minutes int;
alter table noesis.recipes add column if not exists carbs_g numeric;
alter table noesis.recipes add column if not exists fat_g numeric;
alter table noesis.recipes add column if not exists cost_gbp numeric;
create table noesis.meal_plans (id uuid primary key default gen_random_uuid(), title text, prefs jsonb, start_date date, weeks int, created_at timestamptz not null default now(), updated_at timestamptz);
create table noesis.meal_plan_items (id uuid primary key default gen_random_uuid(), plan_id uuid references noesis.meal_plans on delete cascade, date date not null, slot text not null, recipe_id uuid references noesis.recipes on delete set null, recipe_name text, eaten boolean not null default false, rating int, created_at timestamptz not null default now(), updated_at timestamptz);
create index on noesis.meal_plan_items (date);
alter table noesis.usage_log add column if not exists tokens_total int generated always as (tokens_in + tokens_out) stored;
alter table noesis.usage_log add column if not exists duration_ms int;
do $$ declare t text; begin foreach t in array array['unis','courses','meal_plans','meal_plan_items'] loop execute format('alter table noesis.%I enable row level security', t); execute format('grant all on noesis.%I to service_role', t); end loop; end $$;
