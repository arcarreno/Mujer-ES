// =====================================================
// CALL API (Supabase RPC)
// =====================================================
// Server-side authenticated call management
// Replaces client-side broadcast with server-validated RPC

import { supabase } from './supabase'

export interface CallSession {
  id: string
  course_id: string
  admin_user_id: string
  created_at: string
  ended_at: string | null
  is_active: boolean
}

export interface CallParticipant {
  id: string
  session_id: string
  user_id: string
  joined_at: string
  left_at: string | null
  is_active: boolean
}

export interface CallSignal {
  id: string
  session_id: string
  from_user_id: string
  to_user_id: string
  signal_type: string
  payload: any
  created_at: string
  delivered: boolean
}

// =====================================================
// SESSION MANAGEMENT
// =====================================================

export async function createCallSession(courseId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_call_session', {
    p_course_id: courseId,
  })

  if (error) {
    console.error('[CallAPI] Failed to create session:', error)
    return null
  }

  return data
}

export async function joinCallSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase.rpc('join_call_session', {
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[CallAPI] Failed to join session:', error)
    return false
  }

  return true
}

export async function leaveCallSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase.rpc('leave_call_session', {
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[CallAPI] Failed to leave session:', error)
    return false
  }

  return true
}

export async function endCallSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase.rpc('end_call_session', {
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[CallAPI] Failed to end session:', error)
    return false
  }

  return true
}

// =====================================================
// SIGNAL ROUTING (Private, Server-Validated)
// =====================================================

export async function sendSignal(
  sessionId: string,
  toUserId: string,
  signalType: string,
  payload: any
): Promise<boolean> {
  const { error } = await supabase.rpc('send_call_signal', {
    p_session_id: sessionId,
    p_to_user_id: toUserId,
    p_signal_type: signalType,
    p_payload: payload,
  })

  if (error) {
    console.error('[CallAPI] Failed to send signal:', error)
    return false
  }

  return true
}

export async function pollSignals(sessionId: string): Promise<CallSignal[]> {
  const { data, error } = await supabase.rpc('poll_call_signals', {
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[CallAPI] Failed to poll signals:', error)
    return []
  }

  return data || []
}

// =====================================================
// SUBSCRIPTION (Realtime for new signals)
// =====================================================

export function subscribeToSignals(
  sessionId: string,
  myUserId: string,
  callback: (signal: CallSignal) => void
): () => void {
  const channel = supabase
    .channel(`call-signals:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_signals',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const signal = payload.new as CallSignal
        // Only process signals sent to current user (sync check — no async getUser())
        if (signal.to_user_id === myUserId) {
          callback(signal)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// =====================================================
// HELPER: Get active session for a course
// =====================================================

export async function getActiveSession(courseId: string): Promise<CallSession | null> {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_active', true)
    .single()

  if (error) {
    return null
  }

  return data
}

// =====================================================
// HELPER: Get participants in a session
// =====================================================

export async function getSessionParticipants(sessionId: string): Promise<CallParticipant[]> {
  const { data, error } = await supabase
    .from('call_participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_active', true)

  if (error) {
    return []
  }

  return data || []
}
