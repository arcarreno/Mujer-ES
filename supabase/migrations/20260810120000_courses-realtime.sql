-- Session ended by the admin in another tab/panel: VideoCall subscribes to
-- courses UPDATE and exits the call when session_active flips to false
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courses'
  ) then
    alter publication supabase_realtime add table public.courses;
  end if;
end $$;
