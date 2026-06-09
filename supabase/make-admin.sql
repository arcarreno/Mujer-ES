-- =====================================================
-- HACER ADMIN A UN USUARIO
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- =====================================================
-- Reemplazá 'USER_UUID_HERE' por el ID del usuario en auth.users
-- (lo podés copiar desde Authentication → Users)
-- =====================================================

-- Copiá el UUID del usuario que querés hacer admin
-- y reemplazalo en la línea de abajo
INSERT INTO public.admins (id, username, full_name, phone, password)
SELECT id, username, full_name, phone, password
FROM public.profiles
WHERE id = 'USER_UUID_HERE'
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- VERIFICAR — Debe aparecer tu usuario en la tabla admins
-- =====================================================

select
  u.email,
  a.username,
  a.full_name,
  a.created_at
from public.admins a
join auth.users u on u.id = a.id;
