-- Practice games: chess vs Stockfish at a chosen Elo, and poker vs bots (play chips only).

create table noesis.chess_practice (
  id uuid primary key default gen_random_uuid(),
  elo int not null, color text, result text, score numeric, how text, moves text, start_fen text, plies int,
  created_at timestamptz not null default now()
);

create table noesis.poker_practice (
  id uuid primary key default gen_random_uuid(),
  hand_no int, cards text, board text, net int, net_bb numeric, won boolean, showdown boolean,
  vpip boolean, pfr boolean, opponents int, folded boolean,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'noesis' loop
    execute format('alter table noesis.%I enable row level security', t);
  end loop;
end $$;
grant all on all tables in schema noesis to service_role;
