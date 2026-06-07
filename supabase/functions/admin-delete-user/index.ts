// supabase/functions/admin-delete-user/index.ts
// Desplegar con: supabase functions deploy admin-delete-user
// Requiere: SUPABASE_SERVICE_ROLE_KEY configurado como secret

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

    // 1. Cliente con sesión del usuario que llama
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    // 2. Verificar que el caller es admin
    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response('Forbidden - admin only', { status: 403, headers: corsHeaders })
    }

    // 3. Obtener el userId a eliminar
    const { user_id } = await req.json()
    if (!user_id) {
      return new Response('user_id is required', { status: 400, headers: corsHeaders })
    }

    if (user_id === caller.id) {
      return new Response('No puedes eliminarte a ti mismo', { status: 400, headers: corsHeaders })
    }

    // 4. Cliente admin con service role
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!
    )

    // 5. Eliminar usuario (cascade borra profile/admins y form_responses)
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
