-- =====================================================
-- MIGRATION: Re-seed general chat + protect it from deletion
-- The general chat row was cascade-deleted when the user it
-- referenced (seeded user_id) was removed from auth.users.
-- Re-inserted with user_id NULL so it can never cascade again.
-- A BEFORE DELETE trigger blocks any future deletion.
-- =====================================================

-- 1. Re-seed the general chat conversation (idempotent)
INSERT INTO public.conversations (id, user_id, type, state, participants)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  NULL,
  'general',
  'open',
  ARRAY[]::uuid[]
ON CONFLICT (id) DO NOTHING;

-- 2. Protect the general chat from deletion
CREATE OR REPLACE FUNCTION public.prevent_general_chat_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.type = 'general' THEN
    RAISE EXCEPTION 'El chat general no se puede eliminar';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_general_chat_deletion ON public.conversations;
CREATE TRIGGER trg_prevent_general_chat_deletion
  BEFORE DELETE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_general_chat_deletion();
