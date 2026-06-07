-- =====================================================
-- FIX — Infinite recursion en RLS de profiles
-- El problema: las policies "admins ..." hacen
--   select from public.profiles where role = 'admin'
-- dentro de su USING clause, lo que vuelve a disparar RLS
-- sobre profiles, causando recursión infinita (500).
--
-- Solución: helper function con security definer que
-- bypasea RLS al consultar si el user es admin.
-- =====================================================

-- 1. Crear función helper
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- 2. Eliminar policies recursivas
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "admins update any profile" on public.profiles;
drop policy if exists "admins read all convs" on public.conversations;
drop policy if exists "admins update all convs" on public.conversations;
drop policy if exists "admins read all messages" on public.messages;
drop policy if exists "admins send messages" on public.messages;
drop policy if exists "admins read all responses" on public.form_responses;
drop policy if exists "admins read admin convs" on public.conversations;
drop policy if exists "admins create admin convs" on public.conversations;
drop policy if exists "admins read admin chat messages" on public.messages;
drop policy if exists "admins send in admin chat" on public.messages;

-- 3. Recrear usando is_admin() (no recursivo)

-- PROFILES
create policy "admins read all profiles" on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy "admins update any profile" on public.profiles
  for update to authenticated
  using (public.is_admin());

-- CONVERSATIONS
create policy "admins read all convs" on public.conversations
  for select to authenticated
  using (public.is_admin());

create policy "admins update all convs" on public.conversations
  for update to authenticated
  using (public.is_admin());

create policy "admins read admin convs" on public.conversations
  for select to authenticated
  using (
    type = 'admin_admin'
    and auth.uid() = any(participants)
    and public.is_admin()
  );

create policy "admins create admin convs" on public.conversations
  for insert to authenticated
  with check (
    type = 'admin_admin'
    and auth.uid() = any(participants)
    and public.is_admin()
  );

-- MESSAGES
create policy "admins read all messages" on public.messages
  for select to authenticated
  using (public.is_admin());

create policy "admins send messages" on public.messages
  for insert to authenticated
  with check (
    sender_role in ('admin', 'bot', 'system')
    and public.is_admin()
  );

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

-- FORM_RESPONSES
create policy "admins read all responses" on public.form_responses
  for select to authenticated
  using (public.is_admin());

-- =====================================================
-- Verificar que las policies quedaron bien
-- =====================================================
select tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
