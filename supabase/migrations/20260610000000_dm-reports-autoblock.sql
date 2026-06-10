-- =====================================================
-- MIGRATION: DM chats, reports, auto-block system
-- =====================================================

-- 1. Add 'dm' to conversations type CHECK
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conv_type_check;
ALTER TABLE public.conversations ADD CONSTRAINT conv_type_check
  CHECK (type IN ('user_support', 'general', 'dm'));

-- 2. Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reported_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reporter_id, reported_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can insert reports" ON public.reports;
CREATE POLICY "users can insert reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND auth.uid() != reported_id);

DROP POLICY IF EXISTS "users read own reports" ON public.reports;
CREATE POLICY "users read own reports" ON public.reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR auth.uid() = reported_id);

DROP POLICY IF EXISTS "admins read all reports" ON public.reports;
CREATE POLICY "admins read all reports" ON public.reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 3. Auto-block function: after 5 reports, block for 30 days
CREATE OR REPLACE FUNCTION public.auto_block_on_reports()
RETURNS TRIGGER AS $$
DECLARE
  report_count int;
BEGIN
  SELECT count(*) INTO report_count
  FROM public.reports
  WHERE reported_id = NEW.reported_id;

  IF report_count >= 5 THEN
    UPDATE public.profiles
    SET blocked_until = now() + interval '30 days'
    WHERE id = NEW.reported_id
      AND (blocked_until IS NULL OR blocked_until < now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_block ON public.reports;
CREATE TRIGGER trg_auto_block
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_block_on_reports();

-- 4. Fix RLS for conversations (DM support)
-- Users can read: own conv, convs where they are participant, or general
DROP POLICY IF EXISTS "user reads own conv" ON public.conversations;
CREATE POLICY "user reads own conv" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid()::text = ANY(SELECT unnest(participants::text[]))
    OR type = 'general'
  );

-- Users can create DM or user_support conversations
DROP POLICY IF EXISTS "user creates own conv" ON public.conversations;
CREATE POLICY "user creates own conv" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (type = 'dm' OR type = 'user_support')
  );

-- Users can update conversations they participate in
DROP POLICY IF EXISTS "user updates own conv" ON public.conversations;
CREATE POLICY "user updates own conv" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid()::text = ANY(SELECT unnest(participants::text[]))
  );

-- 5. Fix RLS for messages (DM support)
-- Users can read messages in conversations they participate in
DROP POLICY IF EXISTS "user reads own messages" ON public.messages;
CREATE POLICY "user reads own messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.user_id = auth.uid()
        OR auth.uid()::text = ANY(SELECT unnest(c.participants::text[]))
        OR c.type = 'general'
      )
    )
  );

-- Users can send messages in conversations they participate in
DROP POLICY IF EXISTS "user sends own messages" ON public.messages;
CREATE POLICY "user sends own messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'user'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.user_id = auth.uid()
        OR auth.uid()::text = ANY(SELECT unnest(c.participants::text[]))
        OR c.type = 'general'
      )
    )
  );

-- Users can mark messages as read in their conversations
DROP POLICY IF EXISTS "Users can update read in general" ON public.messages;
CREATE POLICY "users can update read in own convs" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.user_id = auth.uid()
        OR auth.uid()::text = ANY(SELECT unnest(c.participants::text[]))
        OR c.type = 'general'
      )
    )
  );

-- 6. Enable Realtime on reports
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
