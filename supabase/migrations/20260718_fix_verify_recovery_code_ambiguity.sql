-- Fix: column "expires_at" was ambiguous between returns table and password_reset_tokens.expires_at
-- Qualified the column reference in the WHERE clause

drop function if exists public.verify_recovery_code(text, text);

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
  select id into v_user_id from auth.users
  where email = lower(trim(p_email));

  if v_user_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.password_reset_tokens
    where user_id = v_user_id
      and token = p_code
      and used = false
      and public.password_reset_tokens.expires_at > now()
  ) then
    return;
  end if;

  update public.password_reset_tokens
  set used = true
  where user_id = v_user_id
    and token = p_code;

  v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + interval '10 minutes';

  insert into public.password_reset_tokens (user_id, token, expires_at)
  values (v_user_id, v_new_token, v_expires);

  return query select v_new_token, v_expires;
end;
$$;

grant execute on function public.verify_recovery_code(text, text) to anon, authenticated;
