-- Admin can remove any enrollment (frees the slot: capacity is counted dynamically)
drop policy if exists "admins delete enrollments" on public.course_enrollments;
create policy "admins delete enrollments" on public.course_enrollments
  for delete to authenticated
  using (public.is_admin());
