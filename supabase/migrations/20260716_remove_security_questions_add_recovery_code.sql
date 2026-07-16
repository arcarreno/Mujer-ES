-- =====================================================
-- REMOVE SECURITY QUESTIONS + ADD EMAIL RECOVERY CODE
-- =====================================================
-- Reemplaza la recuperación por preguntas de seguridad
-- con un código de 6 dígitos enviado por email vía Resend.
--
-- This migration:
--   1. Drops security_questions tables
--   2. Drops old security-questions RPCs
--   3. Updates handle_new_user trigger (remove sq logic)
--   4. Creates verify_recovery_code RPC
-- =====================================================

-- -----------------------------------------------------
-- 1. Drop security_questions tables
-- -----------------------------------------------------
drop table if exists public.admin_security_questions;
drop table if exists public.security_questions;

-- -----------------------------------------------------
-- 2. Drop old security-questions RPCs
-- -----------------------------------------------------
drop function if exists public.get_security_questions(text);
drop function if exists public.verify_security_answers(text, text, text, text);
drop function if exists public.save_user_security_questions(text, text, text, text, text, text);

-- -----------------------------------------------------
-- 3. Update handle_new_user trigger — remove sq logic
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

-- -----------------------------------------------------
-- 4. RPC: verify_recovery_code
--     Validates a 6-digit recovery code and returns a
--     one-time reset_token (hex) for modify_password.
-- -----------------------------------------------------
create or replace function public.verify_recovery_code(
  p_email text,
  p_code text
)
returns table (reset_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_new_token text;
  v_expires timestamptz;
begin
  -- Lookup user by email
  select id into v_user_id from auth.users
  where email = lower(trim(p_email));

  if v_user_id is null then
    return;
  end if;

  -- Verify the code exists, is unused, and not expired
  if not exists (
    select 1 from public.password_reset_tokens
    where user_id = v_user_id
      and token = p_code
      and used = false
      and expires_at > now()
  ) then
    return;
  end if;

  -- Mark the code as used
  update public.password_reset_tokens
  set used = true
  where user_id = v_user_id
    and token = p_code;

  -- Generate a new reset token for modify_password_with_token
  v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + interval '10 minutes';

  insert into public.password_reset_tokens (user_id, token, expires_at)
  values (v_user_id, v_new_token, v_expires);

  return query select v_new_token, v_expires;
end;
$$;

grant execute on function public.verify_recovery_code(text, text) to anon, authenticated;

-- =====================================================
-- DONE.
-- =====================================================
