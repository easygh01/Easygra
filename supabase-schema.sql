create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null default 'Gość' check (char_length(player_name) between 1 and 24),
  points bigint not null default 1000 check (points >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.big_wins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 24),
  points bigint not null check (points > 1000),
  game_title text not null check (char_length(game_title) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 24),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists players_points_rank_idx on public.players (points desc);
create index if not exists big_wins_created_idx on public.big_wins (created_at desc);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);

alter table public.players enable row level security;
alter table public.big_wins enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Players are visible to signed-in visitors" on public.players;
create policy "Players are visible to signed-in visitors"
  on public.players for select to authenticated using (true);
drop policy if exists "Players can create their own profile" on public.players;
create policy "Players can create their own profile"
  on public.players for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Players can update their own profile" on public.players;
create policy "Players can update their own profile"
  on public.players for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Big wins are visible to signed-in visitors" on public.big_wins;
create policy "Big wins are visible to signed-in visitors"
  on public.big_wins for select to authenticated using (true);
drop policy if exists "Players can publish their own big wins" on public.big_wins;
create policy "Players can publish their own big wins"
  on public.big_wins for insert to authenticated with check (auth.uid() = player_id and points > 1000);

drop policy if exists "Chat is visible to signed-in visitors" on public.chat_messages;
create policy "Chat is visible to signed-in visitors"
  on public.chat_messages for select to authenticated using (true);
drop policy if exists "Players can send their own chat messages" on public.chat_messages;
create policy "Players can send their own chat messages"
  on public.chat_messages for insert to authenticated with check (auth.uid() = player_id);

do $$
begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.big_wins;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;