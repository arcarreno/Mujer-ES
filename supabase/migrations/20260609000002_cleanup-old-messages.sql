-- Auto-delete messages older than 24 hours
-- Uses pg_cron to run every hour

-- Create the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.messages
  WHERE created_at < now() - interval '24 hours';
$$;

-- Schedule the job to run every hour
SELECT cron.schedule(
  'cleanup-old-messages',     -- job name
  '0 * * * *',                -- every hour at minute 0
  $$
    SELECT public.cleanup_old_messages();
  $$
);
