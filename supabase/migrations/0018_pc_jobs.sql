-- PC control: approved commands run by the relay on Reg's PC
alter table noesis.jobs drop constraint if exists jobs_kind_check;
alter table noesis.jobs add constraint jobs_kind_check check (kind in ('apollo','build','report','research','ship','rollback','stt','pc'));
