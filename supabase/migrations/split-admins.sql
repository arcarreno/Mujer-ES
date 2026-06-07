-- =====================================================
-- SPLIT: admins into a separate table
-- =====================================================
-- Run this ONCE in Supabase SQL Editor.
-- This will:
--   1. Create public.admins (with phone + password)
--   2. Drop phone, phone_verified, role from public.profiles
--   3. Move any existing admin from profiles → admins
--   4. Replace handle_new_user trigger to route by metadata.role
--   5. Replace is_admin() to check the admins table
-- =====================================================

-- -----------------------------------------------------
-- 1. Create admins table
-- -----------------------------------------------------
create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  phone text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admins_username_idx on public.admins (username);

alter table public.admins enable row level security;

-- -----------------------------------------------------
-- 2. Move existing admin from profiles → admins (if any)
-- -----------------------------------------------------
do $$
declare
  v_role_col text;
begin
  -- Detect whether profiles.role still exists
  select data_type into v_role_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';

  if v_role_col is not null then
    insert into public.admins (id, username, full_name, phone, password)
    select id, username, full_name, phone, null
    from public.profiles
    where role = 'admin'
    on conflict (id) do nothing;

    delete from public.profiles where role = 'admin';
  end if;
end $$;

-- -----------------------------------------------------
-- 3. Drop unused columns from profiles
-- -----------------------------------------------------
alter table public.profiles
  drop column if exists phone,
  drop column if exists phone_verified,
  drop column if exists role;

-- -----------------------------------------------------
-- 4. Replace handle_new_user trigger
--    Routes to admins if metadata.role = 'admin',
--    otherwise to profiles.
-- -----------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'user');
  v_username text := new.raw_user_meta_data->>'username';
  v_full_name text := new.raw_user_meta_data->>'full_name';
  v_phone text := new.raw_user_meta_data->>'phone';
  v_password text := new.raw_user_meta_data->>'password';
begin
  if v_role = 'admin' then
    insert into public.admins (id, username, full_name, phone, password)
    values (new.id, v_username, v_full_name, v_phone, v_password)
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, username, full_name)
    values (new.id, v_username, v_full_name)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------
-- 5. Replace is_admin() — checks the admins table
-- -----------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admins where id = auth.uid()
  );
$$;

-- -----------------------------------------------------
-- 6. Refresh RLS policies
-- -----------------------------------------------------
-- Drop old profiles policies (they were keyed on role)
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = id);

-- admins policies: only admins can read/write admins
drop policy if exists "admins_select_admin" on public.admins;
drop policy if exists "admins_insert_admin" on public.admins;
drop policy if exists "admins_update_admin" on public.admins;
drop policy if exists "admins_delete_admin" on public.admins;

create policy "admins_select_admin"
  on public.admins for select
  using (public.is_admin() or auth.uid() = id);

create policy "admins_insert_admin"
  on public.admins for insert
  with check (public.is_admin());

create policy "admins_update_admin"
  on public.admins for update
  using (public.is_admin() or auth.uid() = id);

create policy "admins_delete_admin"
  on public.admins for delete
  using (public.is_admin());

-- -----------------------------------------------------
-- 7. Make sure realtime is enabled for both tables
-- -----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'admins'
  ) then
    execute 'alter publication supabase_realtime add table public.admins';
  end if;
exception when duplicate_object then
  null;
end $$;

-- =====================================================
-- DONE. Verify with:
--   \d public.profiles
--   \d public.admins
--   select * from public.admins;
-- =====================================================
