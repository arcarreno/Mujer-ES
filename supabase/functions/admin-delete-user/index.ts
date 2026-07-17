import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')!
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { data: isAdmin } = await callerClient.rpc('is_admin')

    if (!isAdmin) {
      return new Response('Forbidden - admin only', { status: 403, headers: corsHeaders })
    }

    const { user_id } = await req.json()
    if (!user_id) {
      return new Response('user_id is required', { status: 400, headers: corsHeaders })
    }

    if (user_id === caller.id) {
      return new Response('No puedes eliminarte a ti mismo', { status: 400, headers: corsHeaders })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')!
    )

    // Clean up WebRTC data manually before auth delete
    // (belt-and-suspenders: some FKs may lack ON DELETE CASCADE)
    await adminClient.from('call_signals').delete().or(`from_user_id.eq.${user_id},to_user_id.eq.${user_id}`)
    await adminClient.from('call_participants').delete().eq('user_id', user_id)
    await adminClient.from('call_sessions').delete().eq('admin_user_id', user_id)

    // Delete from auth.users — this cascades to profiles, admins,
    // course_enrollments, reports, security_questions, etc.
    const { error } = await adminClient.auth.admin.deleteUser(user_id)

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, deleted_user_id: user_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
