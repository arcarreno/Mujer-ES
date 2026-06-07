-- =====================================================
-- HACER ADMIN A UN USUARIO
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- =====================================================

-- OPCIÓN 1: Si el usuario YA se registró por la app
-- (reemplazá 'tu@correo.com' por tu correo)
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users
  where email = 'tu@correo.com'
);

-- OPCIÓN 2: Crear usuario admin desde cero (sin pasar por la app)
-- Primero andá a Authentication → Users → Add user → Create new user
-- con tu email y una contraseña. Después ejecutá:

insert into public.profiles (id, username, full_name, phone, role, phone_verified)
select
  id,
  'admin',
  'Administrador',
  null,
  'admin',
  false
from auth.users
where email = 'tu@correo.com'
on conflict (id) do update
  set role = 'admin';

-- =====================================================
-- VERIFICAR — Debe aparecer tu usuario con role = 'admin'
-- =====================================================

select
  u.email,
  p.username,
  p.full_name,
  p.role,
  p.created_at
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';

-- =====================================================
-- PARA AGREGAR MÁS ADMINS DESPUÉS (repetir por cada uno)
-- =====================================================

-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'otro@correo.com');
