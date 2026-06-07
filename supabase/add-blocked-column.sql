-- =====================================================
-- ADD — blocked_until column to profiles
-- Cuando blocked_until > now(), el usuario está bloqueado
-- y no puede iniciar sesión.
-- =====================================================

alter table public.profiles
  add column if not exists blocked_until timestamptz;

create index if not exists idx_profiles_blocked
  on public.profiles(blocked_until)
  where blocked_until is not null;

comment on column public.profiles.blocked_until is
  'Si está en el futuro, el usuario está bloqueado hasta esa fecha. NULL = no bloqueado.';
