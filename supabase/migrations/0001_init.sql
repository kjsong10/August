-- Enable required extension (gen_random_uuid)
create extension if not exists pgcrypto;

-- Profiles mirror auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  display_name text
);

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Profiles policies
create policy "Profiles are viewable by owner" on public.profiles
  for select using (auth.uid() = id);
create policy "Profiles can be inserted by owner" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Profiles can be updated by owner" on public.profiles
  for update using (auth.uid() = id);

-- Conversations policies
create policy "Users view their conversations" on public.conversations
  for select using (auth.uid() = user_id);
create policy "Users insert their conversations" on public.conversations
  for insert with check (auth.uid() = user_id);
create policy "Users update their conversations" on public.conversations
  for update using (auth.uid() = user_id);
create policy "Users delete their conversations" on public.conversations
  for delete using (auth.uid() = user_id);

-- Messages policies: require ownership via conversation
create policy "Users view their messages" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "Users insert their messages" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "Users delete their messages" on public.messages
  for delete using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- Keep conversations.updated_at fresh on new messages
create or replace function public.touch_conversation_updated_at()
returns trigger as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_conversation_updated_at on public.messages;
create trigger trg_touch_conversation_updated_at
after insert on public.messages
for each row execute function public.touch_conversation_updated_at();

-- Auto-create profile for new users
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();


