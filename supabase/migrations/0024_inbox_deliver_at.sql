-- timed reminders: only visible once deliver_at has passed
alter table noesis.inbox_items add column if not exists deliver_at timestamptz;
