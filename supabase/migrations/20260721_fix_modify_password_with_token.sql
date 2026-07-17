-- =====================================================
-- FIX: modify_password_with_token
-- =====================================================
-- The old version stored the password in the `password`
-- column (plaintext) instead of `password_hash` (SHA-256 + salt).
-- Also lacked `extensions` in search_path, which could
-- cause crypt/gen_salt resolution issues.
-- =====================================================

create or replace function public.modify_password_with_token(
  p_token text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_salt text;
  v_hash text;
  v_is_admin boolean;
begin
  select user_id into v_user_id
  from public.password_reset_tokens
  where token = p_token and used = false and expires_at > now();

  if v_user_id is null then
    raise exception 'Token inválido o expirado';
  end if;

  -- Mark token as used
  update public.password_reset_tokens
    set used = true
    where token = p_token;

  -- Update auth.users (the real login password) with bcrypt
  update auth.users
    set encrypted_password = crypt(p_new_password, gen_salt('bf'))
    where id = v_user_id;

  -- Generate salt and SHA-256 hash for app-level password store
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(
    digest(v_salt || p_new_password, 'sha256'),
    'hex'
  );

  -- Check if user is admin
  select exists(select 1 from public.admins where id = v_user_id) into v_is_admin;

  if v_is_admin then
    update public.admins
    set password_hash = v_salt || ':' || v_hash,
        password = null,
        first_login = false
    where id = v_user_id;
  else
    update public.profiles
    set password_hash = v_salt || ':' || v_hash,
        password = null,
        first_login = false
    where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.modify_password_with_token(text, text) to anon, authenticated;
