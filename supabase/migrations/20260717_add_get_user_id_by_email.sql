-- RPC para buscar user_id por email en auth.users
-- Usado por la edge function send-recovery-code

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth
as $$
  select id from auth.users where email = lower(trim(p_email));
$$;

grant execute on function public.get_user_id_by_email(text) to anon, authenticated;
