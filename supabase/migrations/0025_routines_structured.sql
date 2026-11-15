-- Fitness > Routines upgrade: structured exercises (items), split, soft delete; workout duration/volume.
alter table noesis.routines add column if not exists split text, add column if not exists items jsonb, add column if not exists deleted_at timestamptz, add column if not exists position int;
alter table noesis.workouts add column if not exists duration_min int, add column if not exists volume numeric, add column if not exists finished_at timestamptz;
-- existing text routines -> items, one per line ("Bench press 4x8" -> {name, sets, reps}); the old text stays as a fallback
update noesis.routines r set
  split = case when r.name ilike '%upper%' then 'upper' when r.name ilike '%lower%' then 'lower' when r.name ilike '%push%' then 'push' when r.name ilike '%pull%' then 'pull' when r.name ilike '%leg%' then 'legs' when r.name ilike '%core%' then 'core' when r.name ilike '%full%' then 'full body' else coalesce(nullif(r.day, ''), 'other') end,
  items = (select jsonb_agg(case when m is not null then jsonb_build_object('name', trim(m[1]), 'sets', m[2]::int, 'reps', trim(m[3]))
      when s is not null then jsonb_build_object('name', trim(s[1]), 'sets', s[2]::int, 'reps', 'to failure') else jsonb_build_object('name', trim(line), 'note', true) end order by n)
    from regexp_split_to_table(case when jsonb_typeof(r.exercises) = 'string' then r.exercises #>> '{}' else r.exercises::text end, E'\n') with ordinality as l(line, n),
    lateral (select regexp_match(line, '^(.*?)\s+(\d+)\s*[x×]\s*(.+)$', 'i') as m) a, lateral (select regexp_match(line, '^(.*?)\s+(\d+)\s+sets?$', 'i') as s) b
    where trim(line) <> '')
where r.items is null and r.exercises is not null;
