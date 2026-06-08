-- Add QR code, access code, and attendance tracking to course_enrollments
alter table public.course_enrollments add column if not exists qr_code text;
alter table public.course_enrollments add column if not exists access_code text;
alter table public.course_enrollments add column if not exists attended boolean not null default false;
alter table public.course_enrollments add column if not exists attended_at timestamptz;

-- Unique constraint on qr_code for fast lookup during scan
create unique index if not exists idx_enrollments_qr on public.course_enrollments(qr_code) where qr_code is not null;
create unique index if not exists idx_enrollments_access_code on public.course_enrollments(access_code, course_id) where access_code is not null;

-- Admins can update attendance
drop policy if exists "admins update enrollments" on public.course_enrollments;
create policy "admins update enrollments" on public.course_enrollments
  for update to authenticated
  using (public.is_admin());
