alter table noesis.jobs drop constraint if exists jobs_status_check;
alter table noesis.jobs add constraint jobs_status_check check (status in ('queued','running','done','error','rate_limited','cancelled','proposed'));
