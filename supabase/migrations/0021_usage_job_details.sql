-- What each Apollo job was (Stats > Apollo usage > job details). All nullable: old rows keep working.
alter table noesis.usage_log
  add column if not exists conversation_id uuid,
  add column if not exists prompt_preview text,
  add column if not exists reply_preview text,
  add column if not exists tools_used jsonb,
  add column if not exists page text,
  add column if not exists history_messages integer,
  add column if not exists error text;
create index if not exists usage_log_conversation_idx on noesis.usage_log (conversation_id);
