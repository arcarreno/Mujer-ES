-- =====================================================
-- Lookup: get_email_by_username
-- =====================================================
-- Returns the auth.users.email for a given profile username.
-- Used by the Login flow to support username-based login
-- (the user can sign in with username OR email).
--
-- Security: SECURITY DEFINER so we can read auth.users
-- (which regular users cannot SELECT from).
-- =====================================================

create or replace function public.get_email_by_username(p_username text)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  select id into v_user_id
  from public.profiles
  where username = p_username
  limit 1;

  if v_user_id is null then
    select id into v_user_id
    from public.admins
    where username = p_username
    limit 1;
  end if;

  if v_user_id is null then
    return null;
  end if;

  select email into v_email
  from auth.users
  where id = v_user_id;

  return v_email;
end;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;
