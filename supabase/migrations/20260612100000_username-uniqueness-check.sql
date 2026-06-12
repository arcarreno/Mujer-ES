-- Function to check if username exists across both profiles and admins
-- Used by admin-create-user edge function for pre-validation
create or replace function public.username_exists(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1 from public.profiles where username = lower(trim(p_username))
    union
    select 1 from public.admins where username = lower(trim(p_username))
  ) into v_exists;
  return v_exists;
end;
$$;

grant execute on function public.username_exists(text) to authenticated;
