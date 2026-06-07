-- =====================================================
-- COURSES — Cursos publicados por admin
-- =====================================================

create table if not exists public.courses (
  id uuid default extensions.gen_random_uuid() primary key,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  modality text not null check (modality in ('virtual', 'presencial')),
  published boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courses_published on public.courses(published);
create index if not exists idx_courses_created_at on public.courses(created_at desc);

-- RLS
alter table public.courses enable row level security;

-- Admins can do everything
drop policy if exists "admins manage courses" on public.courses;
create policy "admins manage courses" on public.courses
  for all to authenticated
  using (public.is_admin());

-- Anyone can read published courses
drop policy if exists "public read published courses" on public.courses;
create policy "public read published courses" on public.courses
  for select to anon, authenticated
  using (published = true);

-- Updated_at trigger
create or replace function public.update_courses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_courses_updated_at on public.courses;
create trigger update_courses_updated_at
  before update on public.courses
  for each row execute procedure public.update_courses_updated_at();
