-- Add session tracking columns to courses for virtual sessions
ALTER TABLE courses ADD COLUMN IF NOT EXISTS session_active BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS session_password TEXT;
