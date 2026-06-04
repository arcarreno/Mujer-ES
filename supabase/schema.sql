-- =====================================================
-- MUJER-ES — Database Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- =====================================================

-- =====================================================
-- 1. PROFILES — Datos extra del usuario
-- =====================================================

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  full_name text not null,
  phone text unique not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  phone_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_phone on public.profiles(phone);
create index if not exists idx_profiles_role on public.profiles(role);

-- =====================================================
-- 2. TRIGGER — Crear profile automático al registrarse
-- =====================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- 3. RLS — Row Level Security en profiles
-- =====================================================

alter table public.profiles enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "admins update any profile" on public.profiles;
create policy "admins update any profile" on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- =====================================================
-- 4. CONVERSATIONS — Chat user ↔ admin
-- =====================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  participants uuid[] not null default '{}',
  type text not null default 'user_admin' check (type in ('user_admin', 'admin_admin')),
  state text not null default 'bot' check (state in ('bot', 'waiting_human', 'human', 'admin_to_admin', 'closed')),
  assigned_admin_id uuid references auth.users,
  bot_step int not null default 0,
  last_message_at timestamptz default now(),
  unread_for_admin int not null default 0,
  unread_for_user int not null default 0,
  created_at timestamptz not null default now(),
  constraint conv_type_user check (
    (type = 'user_admin' and user_id is not null) or
    (type = 'admin_admin' and user_id is null)
  )
);

create unique index if not exists uniq_user_conversation 
  on public.conversations (user_id) 
  where type = 'user_admin';

create index if not exists idx_conv_participants on public.conversations using gin(participants);
create index if not exists idx_conv_state on public.conversations(state);
create index if not exists idx_conv_last_msg on public.conversations(last_message_at desc);

alter table public.conversations enable row level security;

drop policy if exists "user reads own conv" on public.conversations;
create policy "user reads own conv" on public.conversations
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user creates own conv" on public.conversations;
create policy "user creates own conv" on public.conversations
  for insert to authenticated
  with check (auth.uid() = user_id and type = 'user_admin');

drop policy if exists "user updates own conv" on public.conversations;
create policy "user updates own conv" on public.conversations
  for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists "admins read all convs" on public.conversations;
create policy "admins read all convs" on public.conversations
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins update all convs" on public.conversations;
create policy "admins update all convs" on public.conversations
  for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins read admin convs" on public.conversations;
create policy "admins read admin convs" on public.conversations
  for select to authenticated
  using (
    type = 'admin_admin' 
    and auth.uid() = any(participants)
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins create admin convs" on public.conversations;
create policy "admins create admin convs" on public.conversations
  for insert to authenticated
  with check (
    type = 'admin_admin'
    and auth.uid() = any(participants)
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- =====================================================
-- 5. MESSAGES — Mensajes del chat
-- =====================================================

create table if not exists public.messages (
  id bigserial primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references auth.users not null,
  sender_role text not null check (sender_role in ('user', 'admin', 'bot', 'system')),
  content text not null check (length(content) between 1 and 500),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conv_time on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_created on public.messages(created_at);
create index if not exists idx_messages_unread on public.messages(conversation_id, read) where read = false;

alter table public.messages enable row level security;

drop policy if exists "user reads own messages" on public.messages;
create policy "user reads own messages" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

drop policy if exists "user sends own messages" on public.messages;
create policy "user sends own messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role = 'user'
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

drop policy if exists "admins read all messages" on public.messages;
create policy "admins read all messages" on public.messages
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins send messages" on public.messages;
create policy "admins send messages" on public.messages
  for insert to authenticated
  with check (
    sender_role in ('admin', 'bot', 'system')
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins read admin chat messages" on public.messages;
create policy "admins read admin chat messages" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.type = 'admin_admin'
      and auth.uid() = any(c.participants)
    )
  );

drop policy if exists "admins send in admin chat" on public.messages;
create policy "admins send in admin chat" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role = 'admin'
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.type = 'admin_admin'
      and auth.uid() = any(c.participants)
    )
  );

-- =====================================================
-- 6. FORM_RESPONSES — Para formulario futuro
-- =====================================================

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  form_type text not null,
  responses jsonb not null,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_form_responses_user on public.form_responses(user_id);
create index if not exists idx_form_responses_type on public.form_responses(form_type);

alter table public.form_responses enable row level security;

drop policy if exists "user reads own responses" on public.form_responses;
create policy "user reads own responses" on public.form_responses
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user inserts own responses" on public.form_responses;
create policy "user inserts own responses" on public.form_responses
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "admins read all responses" on public.form_responses;
create policy "admins read all responses" on public.form_responses
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- =====================================================
-- 7. AUTO-BORRADO — Mensajes con más de 2 días
-- =====================================================

create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-old-messages',
  '0 3 * * *',
  $$ delete from public.messages where created_at < now() - interval '2 days'; $$
);

-- =====================================================
-- 8. REALTIME — Habilitar suscripciones WebSocket
-- =====================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.profiles;

-- =====================================================
-- ✅ LISTO — Verificar que todo creó correctamente
-- =====================================================

select 'profiles' as tabla, count(*) as registros from public.profiles
union all
select 'conversations', count(*) from public.conversations
union all
select 'messages', count(*) from public.messages
union all
select 'form_responses', count(*) from public.form_responses;
