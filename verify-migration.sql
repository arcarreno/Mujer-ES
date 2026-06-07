-- Verificaci�n completa del estado de la migration
select 'rpcs: ' || string_agg(proname, ', ' order by proname) as status
from pg_proc 
where proname in (
  'get_security_questions', 'verify_security_answers',
  'view_password_with_token', 'modify_password_with_token',
  'save_user_security_questions', 'handle_new_user',
  'get_phone_by_identifier', 'get_email_by_username'
)
union all
select 'tablas: ' || string_agg(tablename, ', ' order by tablename)
from pg_tables 
where schemaname = 'public' 
  and tablename in ('security_questions', 'admin_security_questions', 'password_reset_tokens')
union all
select 'password_reset_tokens columnas: ' || string_agg(column_name || ' (' || data_type || ')', ', ' order by column_name)
from information_schema.columns 
where table_schema = 'public' and table_name = 'password_reset_tokens'
union all
select 'policies en security_questions: ' || string_agg(policyname, ', ' order by policyname)
from pg_policies 
where schemaname = 'public' and tablename = 'security_questions'
union all
select 'policies en admin_security_questions: ' || string_agg(policyname, ', ' order by policyname)
from pg_policies 
where schemaname = 'public' and tablename = 'admin_security_questions'
union all
select 'is_admin() chequea: ' || case 
  when prosrc like '%from public.admins%' then 'admins (correcto)'
  when prosrc like '%from public.profiles%' then 'profiles (viejo)'
  else '?'
end
from pg_proc where proname = 'is_admin';
