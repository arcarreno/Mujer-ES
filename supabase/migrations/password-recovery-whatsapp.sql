-- =====================================================
-- PASSWORD RECOVERY VIA WHATSAPP OTP
-- =====================================================
-- User decision: passwords are stored in plaintext in
-- profiles.password to support a "view my password" flow.
-- DO NOT remove this column. Documented in CLAUDE memory.
--
-- This migration:
--   1. Adds profiles.password (plaintext, nullable)
--   2. Updates handle_new_user trigger to also store
--      the password in profiles.password for regular users
--   3. Creates password_reset_codes table for OTPs
--   4. Creates get_phone_by_identifier RPC (for login flow)
-- =====================================================

-- -----------------------------------------------------
-- 1. Add password column to profiles
-- -----------------------------------------------------
alter table public.profiles
  add column if not exists password text;

-- -----------------------------------------------------
-- 2. Update handle_new_user trigger
--    Also stores password for regular users.
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
    insert into public.profiles (id, username, full_name, password)
    values (new.id, v_username, v_full_name, v_password)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Trigger already exists from split-admins.sql — only function needs to be replaced.

-- -----------------------------------------------------
-- 3. Create password_reset_codes table
--    Stores OTPs sent via WhatsApp.
-- -----------------------------------------------------
create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  phone text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_codes_user_id_idx
  on public.password_reset_codes (user_id);

create index if not exists password_reset_codes_code_idx
  on public.password_reset_codes (code);

-- RLS: no public access. Only service role (edge functions) read/write.
alter table public.password_reset_codes enable row level security;

-- -----------------------------------------------------
-- 4. RPC: get_phone_by_identifier
--    Returns the phone number associated with a user,
--    looked up by username or email.
--    Security definer so regular users can call it.
-- -----------------------------------------------------
create or replace function public.get_phone_by_identifier(p_identifier text)
returns table (user_id uuid, phone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := lower(trim(p_identifier));
begin
  -- Try as username first (could be in profiles or admins)
  return query
    select p.id, p.phone
    from public.profiles p
    where p.username = v_clean and p.phone is not null
    limit 1;

  if not found then
    return query
      select a.id, a.phone
      from public.admins a
      where a.username = v_clean and a.phone is not null
      limit 1;
  end if;

  -- Try as email (lookup in auth.users)
  if not found then
    return query
      select u.id, u.phone::text
      from auth.users u
      where u.email = v_clean and u.phone is not null
      limit 1;
  end if;
end;
$$;

grant execute on function public.get_phone_by_identifier(text) to anon, authenticated;

-- =====================================================
-- DONE. Verify with:
--   \d public.profiles
--   \d public.password_reset_codes
--   select * from public.password_reset_codes;
-- =====================================================
