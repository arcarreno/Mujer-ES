-- Seed the general chat conversation
INSERT INTO public.conversations (id, user_id, type, state, participants)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  (SELECT id FROM auth.users LIMIT 1),
  'general',
  'open',
  '[]'::jsonb
ON CONFLICT (id) DO NOTHING;

-- Allow all authenticated users to read the general conversation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read general chat' AND tablename = 'conversations'
  ) THEN
    CREATE POLICY "Users can read general chat" ON public.conversations
      FOR SELECT USING (type = 'general' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow all authenticated users to read messages in the general conversation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read general messages' AND tablename = 'messages'
  ) THEN
    CREATE POLICY "Users can read general messages" ON public.messages
      FOR SELECT USING (
        conversation_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

-- Allow authenticated users to insert messages in the general conversation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can send to general chat' AND tablename = 'messages'
  ) THEN
    CREATE POLICY "Users can send to general chat" ON public.messages
      FOR INSERT WITH CHECK (
        conversation_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND auth.role() = 'authenticated'
        AND sender_id = auth.uid()
      );
  END IF;
END $$;

-- Allow users to mark their own messages as read in general chat
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update read in general' AND tablename = 'messages'
  ) THEN
    CREATE POLICY "Users can update read in general" ON public.messages
      FOR UPDATE USING (
        conversation_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;
