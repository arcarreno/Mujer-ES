-- Fix: drop old function (returned uuid) and recreate with table type
-- so PostgREST returns { user_id: "..." } instead of { get_user_id_by_email: "..." }

drop function if exists public.get_user_id_by_email(text);

create or replace function public.get_user_id_by_email(p_email text)
returns table (user_id uuid)
language sql
security definer
set search_path = auth
as $$
  select id as user_id from auth.users where email = lower(trim(p_email));
$$;

grant execute on function public.get_user_id_by_email(text) to anon, authenticated;
