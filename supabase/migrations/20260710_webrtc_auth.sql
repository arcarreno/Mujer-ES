-- =====================================================
-- WEBRTC SERVER-SIDE AUTH & PRIVATE SIGNAL ROUTING
-- =====================================================
-- These functions enable:
-- 1. Server-side admin command validation
-- 2. Private signal routing (only target user receives)
-- 3. Session management with role enforcement

-- Table to track active call sessions
CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id TEXT NOT NULL,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Index for quick lookup by course
CREATE INDEX IF NOT EXISTS idx_call_sessions_course ON call_sessions(course_id) WHERE is_active = TRUE;

-- Table to track participants in a call
CREATE TABLE IF NOT EXISTS call_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(session_id, user_id)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_call_participants_session ON call_participants(session_id) WHERE is_active = TRUE;

-- Table for private signaling (replaces broadcast)
CREATE TABLE IF NOT EXISTS call_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_user_id UUID NOT NULL REFERENCES auth.users(id),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'mute-all', 'kick', 'end-session', 'screen-share-started', 'screen-share-stopped')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered BOOLEAN DEFAULT FALSE
);

-- Index for polling new signals
CREATE INDEX IF NOT EXISTS idx_call_signals_pending ON call_signals(to_user_id, session_id) WHERE delivered = FALSE;

-- RLS policies
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_signals ENABLE ROW LEVEL SECURITY;

-- Users can read sessions for courses they're enrolled in
CREATE POLICY "Users can view call sessions" ON call_sessions
  FOR SELECT USING (
    course_id IN (
      SELECT course_id::text FROM course_enrollments WHERE user_id = auth.uid()
    )
    OR admin_user_id = auth.uid()
  );

-- Only admins can create sessions
CREATE POLICY "Admins can create call sessions" ON call_sessions
  FOR INSERT WITH CHECK (
    admin_user_id = auth.uid()
    AND public.is_admin()
  );

-- Only session admin can end sessions
CREATE POLICY "Admin can end session" ON call_sessions
  FOR UPDATE USING (
    admin_user_id = auth.uid()
  );

-- Users can join sessions they're enrolled in
CREATE POLICY "Users can join call sessions" ON call_participants
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND session_id IN (
      SELECT id FROM call_sessions WHERE is_active = TRUE
    )
  );

-- Users can view participants in their sessions
CREATE POLICY "Users can view participants" ON call_participants
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM call_sessions
      WHERE course_id IN (
        SELECT course_id::text FROM course_enrollments WHERE user_id = auth.uid()
      )
      OR admin_user_id = auth.uid()
    )
  );

-- Users can update their own participant record
CREATE POLICY "Users can update own participant" ON call_participants
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Users can send signals to anyone in the same session
CREATE POLICY "Users can send signals" ON call_signals
  FOR INSERT WITH CHECK (
    from_user_id = auth.uid()
    AND session_id IN (
      SELECT id FROM call_sessions WHERE is_active = TRUE
    )
  );

-- Users can read signals sent to them
CREATE POLICY "Users can read own signals" ON call_signals
  FOR SELECT USING (
    to_user_id = auth.uid()
  );

-- Users can mark their signals as delivered
CREATE POLICY "Users can mark signals delivered" ON call_signals
  FOR UPDATE USING (
    to_user_id = auth.uid()
  );

-- =====================================================
-- RPC FUNCTIONS
-- =====================================================

-- Function to create a call session (admin only)
CREATE OR REPLACE FUNCTION create_call_session(p_course_id TEXT)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create call sessions';
  END IF;

  -- End any existing active session for this course
  UPDATE call_sessions
  SET is_active = FALSE, ended_at = NOW()
  WHERE course_id = p_course_id AND is_active = TRUE;

  -- Create new session
  INSERT INTO call_sessions (course_id, admin_user_id)
  VALUES (p_course_id, auth.uid())
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to join a call session
CREATE OR REPLACE FUNCTION join_call_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Check if session exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM call_sessions WHERE id = p_session_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  -- Check if user is enrolled in the course
  IF NOT EXISTS (
    SELECT 1 FROM call_sessions cs
    JOIN course_enrollments e ON e.course_id::text = cs.course_id
    WHERE cs.id = p_session_id AND e.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM call_sessions WHERE id = p_session_id AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not enrolled in this course';
  END IF;

  -- Upsert participant
  INSERT INTO call_participants (session_id, user_id, is_active)
  VALUES (p_session_id, auth.uid(), TRUE)
  ON CONFLICT (session_id, user_id)
  DO UPDATE SET is_active = TRUE, left_at = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send a private signal (with auth checks)
CREATE OR REPLACE FUNCTION send_call_signal(
  p_session_id UUID,
  p_to_user_id UUID,
  p_signal_type TEXT,
  p_payload JSONB
)
RETURNS VOID AS $$
BEGIN
  -- Check if sender is in the session
  IF NOT EXISTS (
    SELECT 1 FROM call_participants
    WHERE session_id = p_session_id AND user_id = auth.uid() AND is_active = TRUE
  ) AND NOT EXISTS (
    SELECT 1 FROM call_sessions WHERE id = p_session_id AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not in this call session';
  END IF;

  -- Check if target is in the session
  IF NOT EXISTS (
    SELECT 1 FROM call_participants
    WHERE session_id = p_session_id AND user_id = p_to_user_id AND is_active = TRUE
  ) AND NOT EXISTS (
    SELECT 1 FROM call_sessions WHERE id = p_session_id AND admin_user_id = p_to_user_id
  ) THEN
    RAISE EXCEPTION 'Target user not in this call session';
  END IF;

  -- Server-side auth for admin-only commands
  IF p_signal_type IN ('mute-all', 'kick', 'end-session') THEN
    IF auth.uid() != (SELECT admin_user_id FROM call_sessions WHERE id = p_session_id) THEN
      RAISE EXCEPTION 'Only the session admin can perform this action';
    END IF;

    -- For kick, validate target is not the admin
    IF p_signal_type = 'kick' THEN
      IF (p_payload->>'targetUserId')::UUID = (SELECT admin_user_id FROM call_sessions WHERE id = p_session_id) THEN
        RAISE EXCEPTION 'Cannot kick the admin';
      END IF;
    END IF;
  END IF;

  -- Insert the signal
  INSERT INTO call_signals (session_id, from_user_id, to_user_id, signal_type, payload)
  VALUES (p_session_id, auth.uid(), p_to_user_id, p_signal_type, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to poll for new signals (long-polling alternative to broadcast)
CREATE OR REPLACE FUNCTION poll_call_signals(p_session_id UUID)
RETURNS SETOF call_signals AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM call_signals
  WHERE to_user_id = auth.uid()
    AND session_id = p_session_id
    AND delivered = FALSE
  ORDER BY created_at ASC;

  -- Mark as delivered
  UPDATE call_signals
  SET delivered = TRUE
  WHERE to_user_id = auth.uid()
    AND session_id = p_session_id
    AND delivered = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to end a call session (admin only)
CREATE OR REPLACE FUNCTION end_call_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM call_sessions WHERE id = p_session_id AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the session admin can end the session';
  END IF;

  UPDATE call_sessions
  SET is_active = FALSE, ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE call_participants
  SET is_active = FALSE, left_at = NOW()
  WHERE session_id = p_session_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to leave a call session
CREATE OR REPLACE FUNCTION leave_call_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE call_participants
  SET is_active = FALSE, left_at = NOW()
  WHERE session_id = p_session_id AND user_id = auth.uid() AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
