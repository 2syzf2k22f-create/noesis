alter table noesis.conversations add column if not exists title_set_by text not null default 'auto';
