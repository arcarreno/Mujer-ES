-- =====================================================
-- ADD FIRST_LOGIN + PASSWORD_HASH
-- =====================================================
-- 1. Add first_login column to profiles and admins
-- 2. Add password_hash column to profiles and admins
-- 3. Create set_initial_password RPC
-- 4. Create hash_password function
-- 5. Create check_first_login RPC
-- 6. Update handle_new_user trigger
-- =====================================================

-- Enable pgcrypto for SHA-256
create extension if not exists "pgcrypto" with schema extensions;

-- -----------------------------------------------------
-- 1. Add columns to profiles
-- -----------------------------------------------------
alter table public.profiles
  add column if not exists first_login boolean not null default true;

alter table public.profiles
  add column if not exists password_hash text;

-- -----------------------------------------------------
-- 2. Add columns to admins  
-- -----------------------------------------------------
alter table public.admins
  add column if not exists first_login boolean not null default true;

alter table public.admins
  add column if not exists password_hash text;

-- -----------------------------------------------------
-- 3. RPC: check_first_login
--     Returns true if the user has first_login = true
-- -----------------------------------------------------
create or replace function public.check_first_login(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
begin
  select first_login into v_first from public.profiles where id = p_user_id;
  if v_first is not null then
    return v_first;
  end if;
  select first_login into v_first from public.admins where id = p_user_id;
  return coalesce(v_first, false);
end;
$$;

grant execute on function public.check_first_login(uuid) to anon, authenticated;

-- -----------------------------------------------------
-- 4. RPC: set_initial_password
--     Sets the user's password on first login.
--     Hashes the password with SHA-256 + salt and stores it.
--     Also marks first_login = false.
-- -----------------------------------------------------
create or replace function public.set_initial_password(
  p_user_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_salt text;
  v_hash text;
  v_is_admin boolean;
begin
  -- Generate salt and SHA-256 hash
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(
    digest(v_salt || p_new_password, 'sha256'),
    'hex'
  );

  -- Update auth.users password (bcrypt)
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;

  -- Check if user is admin
  select exists(select 1 from public.admins where id = p_user_id) into v_is_admin;

  if v_is_admin then
    update public.admins
    set password_hash = v_salt || ':' || v_hash,
        password = null,
        first_login = false
    where id = p_user_id;
  else
    update public.profiles
    set password_hash = v_salt || ':' || v_hash,
        password = null,
        first_login = false
    where id = p_user_id;
  end if;
end;
$$;

grant execute on function public.set_initial_password(uuid, text) to authenticated;

-- -----------------------------------------------------
-- 5. Update handle_new_user trigger
--     No longer stores plaintext password; uses first_login
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
begin
  if v_role = 'admin' then
    insert into public.admins (id, username, full_name, phone, first_login)
    values (new.id, v_username, v_full_name, v_phone, true)
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, username, full_name, first_login)
    values (new.id, v_username, v_full_name, true)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------
-- 6. RPC: verify_password_hash
--     Verifies a password against stored hash (SHA-256 + salt)
-- -----------------------------------------------------
create or replace function public.verify_password_hash(
  p_user_id uuid,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stored text;
  v_salt text;
  v_hash text;
  v_computed text;
begin
  -- Try profiles first, then admins
  select password_hash into v_stored from public.profiles where id = p_user_id;
  if v_stored is null then
    select password_hash into v_stored from public.admins where id = p_user_id;
  end if;

  if v_stored is null then
    return false;
  end if;

  v_salt := split_part(v_stored, ':', 1);
  v_hash := split_part(v_stored, ':', 2);
  v_computed := encode(digest(v_salt || p_password, 'sha256'), 'hex');

  return v_computed = v_hash;
end;
$$;

grant execute on function public.verify_password_hash(uuid, text) to authenticated;
