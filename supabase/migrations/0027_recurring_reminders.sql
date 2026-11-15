create table if not exists noesis.recurring_reminders (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz,
  kind text not null check (kind in ('workout','study','other')), label text not null, weekday int not null check (weekday between 1 and 7),
  start text not null, end_time text, lead_minutes int not null default 30, link text, active boolean not null default true
);
alter table noesis.recurring_reminders enable row level security;
create unique index if not exists inbox_items_external_id_uq on noesis.inbox_items (external_id) where external_id is not null;
