-- Live attendance list: admin sees enrolled users flip ausente -> presente
-- without refreshing (CourseDetailPage subscribes to postgres_changes UPDATE)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'course_enrollments'
  ) then
    alter publication supabase_realtime add table public.course_enrollments;
  end if;
end $$;
