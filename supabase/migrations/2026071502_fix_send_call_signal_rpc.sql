-- =====================================================
-- Fix send_call_signal: allow sending to users not yet in call_participants
-- =====================================================
-- BUG: The original RPC required the target user (p_to_user_id) to already
-- be in call_participants. But the admin sends an offer BEFORE the target
-- user has called joinCallSession() (which happens inside initDurableSignaling).
-- This created a chicken-and-egg problem: the user can't receive an offer
-- because they haven't joined, and they can't join because they need the
-- sessionId which they discover from receiving the offer.
--
-- FIX: Remove the target-in-participants check. The sender validation
-- (must be admin or in call_participants) is sufficient. Signals will be
-- delivered when the recipient subscribes to postgres_changes.
--
-- Also remove the payload-based targetUserId check for kicks (it's redundant
-- since we already have p_to_user_id).

CREATE OR REPLACE FUNCTION send_call_signal(
  p_session_id UUID,
  p_to_user_id UUID,
  p_signal_type TEXT,
  p_payload JSONB
)
RETURNS VOID AS $$
BEGIN
  -- Check if sender is in the session (admin is always allowed)
  IF NOT EXISTS (
    SELECT 1 FROM call_participants
    WHERE session_id = p_session_id AND user_id = auth.uid() AND is_active = TRUE
  ) AND NOT EXISTS (
    SELECT 1 FROM call_sessions WHERE id = p_session_id AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not in this call session';
  END IF;

  -- Server-side auth for admin-only commands
  IF p_signal_type IN ('mute-all', 'kick', 'end-session') THEN
    IF auth.uid() != (SELECT admin_user_id FROM call_sessions WHERE id = p_session_id) THEN
      RAISE EXCEPTION 'Only the session admin can perform this action';
    END IF;
  END IF;

  -- Insert the signal (no target-in-participants check — recipient may join later)
  INSERT INTO call_signals (session_id, from_user_id, to_user_id, signal_type, payload)
  VALUES (p_session_id, auth.uid(), p_to_user_id, p_signal_type, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
