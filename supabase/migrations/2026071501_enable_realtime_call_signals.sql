-- =====================================================
-- Enable Realtime for call_signals table
-- =====================================================
-- Without this, postgres_changes subscriptions on call_signals
-- will never fire, and DB-backed WebRTC signaling won't work.
--
-- The durable signaling approach writes offers/answers/ICE candidates
-- to the call_signals table. The receiving client subscribes to INSERT
-- events via Realtime. This is far more reliable than ephemeral
-- Realtime broadcast channels which lose messages when CLOSED.

-- Add call_signals to the supabase_realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;
end;
$$;
