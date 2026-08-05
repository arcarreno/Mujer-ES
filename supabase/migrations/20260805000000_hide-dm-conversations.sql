-- =====================================================
-- MIGRATION: Hide (soft-delete) DM conversations per user
-- Adds hidden_for so a user can remove a DM chat card from
-- their list without affecting the other participant.
-- The card reappears when a new message arrives in that chat.
-- The general chat can never be hidden.
-- =====================================================

-- 1. hidden_for column (array of user ids who hid this conversation)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS hidden_for uuid[] NOT NULL DEFAULT '{}';

-- 2. RPC: hide a DM conversation for the current user
CREATE OR REPLACE FUNCTION public.hide_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET hidden_for = array_append(hidden_for, auth.uid())
  WHERE id = p_conversation_id
    AND type = 'dm'
    AND auth.uid() IS NOT NULL
    AND auth.uid() = ANY(participants)
    AND NOT (auth.uid() = ANY(hidden_for));
END;
$$;

REVOKE ALL ON FUNCTION public.hide_conversation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hide_conversation(uuid) TO authenticated;

-- 3. Un-hide the conversation when a new message arrives (reappears in the list)
CREATE OR REPLACE FUNCTION public.unhide_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET hidden_for = '{}'
  WHERE id = NEW.conversation_id
    AND hidden_for <> '{}';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unhide_conversation_on_message ON public.messages;
CREATE TRIGGER trg_unhide_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.unhide_conversation_on_message();
