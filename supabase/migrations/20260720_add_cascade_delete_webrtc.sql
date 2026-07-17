-- =====================================================
-- ADD ON DELETE CASCADE to WebRTC FK constraints
-- =====================================================
-- The WebRTC tables were created without ON DELETE CASCADE
-- on their auth.users(id) references, which blocks admin
-- from deleting users who have participated in call sessions.
-- =====================================================

-- Fix call_sessions.admin_user_id → auth.users(id)
ALTER TABLE public.call_sessions
  DROP CONSTRAINT IF EXISTS call_sessions_admin_user_id_fkey,
  ADD CONSTRAINT call_sessions_admin_user_id_fkey
    FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix call_participants.user_id → auth.users(id)
ALTER TABLE public.call_participants
  DROP CONSTRAINT IF EXISTS call_participants_user_id_fkey,
  ADD CONSTRAINT call_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix call_signals.from_user_id → auth.users(id)
ALTER TABLE public.call_signals
  DROP CONSTRAINT IF EXISTS call_signals_from_user_id_fkey,
  ADD CONSTRAINT call_signals_from_user_id_fkey
    FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix call_signals.to_user_id → auth.users(id)
ALTER TABLE public.call_signals
  DROP CONSTRAINT IF EXISTS call_signals_to_user_id_fkey,
  ADD CONSTRAINT call_signals_to_user_id_fkey
    FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
