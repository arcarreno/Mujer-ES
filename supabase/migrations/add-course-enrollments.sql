-- Course enrollments: tracks which users enrolled in which courses
create table if not exists public.course_enrollments (
  id uuid default extensions.gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  course_id uuid references public.courses on delete cascade not null,
  enrolled_at timestamptz not null default now(),
  unique(user_id, course_id)
);

create index if not exists idx_enrollments_course on public.course_enrollments(course_id);
create index if not exists idx_enrollments_user on public.course_enrollments(user_id);

-- RLS
alter table public.course_enrollments enable row level security;

-- Users can read their own enrollments
drop policy if exists "users read own enrollments" on public.course_enrollments;
create policy "users read own enrollments" on public.course_enrollments
  for select to authenticated
  using (user_id = auth.uid());

-- Users can enroll themselves
drop policy if exists "users enroll themselves" on public.course_enrollments;
create policy "users enroll themselves" on public.course_enrollments
  for insert to authenticated
  with check (user_id = auth.uid());

-- Users can unenroll themselves
drop policy if exists "users unenroll themselves" on public.course_enrollments;
create policy "users unenroll themselves" on public.course_enrollments
  for delete to authenticated
  using (user_id = auth.uid());

-- Admins can read all enrollments
drop policy if exists "admins read all enrollments" on public.course_enrollments;
create policy "admins read all enrollments" on public.course_enrollments
  for select to authenticated
  using (public.is_admin());
