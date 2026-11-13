alter table noesis.usage_log add column if not exists plan_5h_pct numeric;
alter table noesis.usage_log add column if not exists plan_7d_pct numeric;
alter table noesis.usage_log add column if not exists plan_5h_delta numeric;
alter table noesis.usage_log add column if not exists plan_7d_delta numeric;
alter table noesis.notes add column if not exists embedding public.vector(384);
create index if not exists note_chunks_embedding_idx on noesis.note_chunks using hnsw (embedding public.vector_cosine_ops);
create index if not exists notes_embedding_idx on noesis.notes using hnsw (embedding public.vector_cosine_ops);
-- Smart search: closest sections by meaning across knowledge sources and your own notes.
create or replace function noesis.match_knowledge(query public.vector(384), k int default 8, subj text default null)
returns table (kind text, id uuid, title text, text text, subject text, url text, similarity float)
language sql stable security invoker set search_path = noesis, extensions, public as $$
  (select 'source', c.id, c.source_title, c.text, c.subject, s.url, 1 - (c.embedding <=> query)
     from noesis.note_chunks c left join noesis.sources s on s.id = c.source_id
    where c.embedding is not null and (subj is null or c.subject = subj)
    order by c.embedding <=> query limit k)
  union all
  (select 'note', n.id, n.title, left(n.body, 1500), n.subject, n.link, 1 - (n.embedding <=> query)
     from noesis.notes n
    where n.embedding is not null and n.deleted_at is null and (subj is null or n.subject = subj)
    order by n.embedding <=> query limit k)
  order by similarity desc limit k;
$$;
revoke all on function noesis.match_knowledge from public, anon, authenticated;
grant execute on function noesis.match_knowledge to service_role;
