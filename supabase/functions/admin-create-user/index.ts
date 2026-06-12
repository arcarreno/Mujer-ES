// supabase/functions/admin-create-user/index.ts
// Desplegar con: supabase functions deploy admin-create-user

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

    const { data: { user: caller }, error: getUserErr } = await callerClient.auth.getUser()
    if (getUserErr || !caller) {
      return new Response(
        JSON.stringify({ error: 'No se pudo verificar la sesión: ' + (getUserErr?.message || 'usuario no encontrado') }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: isAdmin, error: adminCheckErr } = await callerClient.rpc('is_admin')
    if (adminCheckErr) {
      return new Response(
        JSON.stringify({ error: 'Error al verificar permisos: ' + adminCheckErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Solo los administradores pueden crear usuarios' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { email, password, full_name, username, phone, is_admin } = await req.json()
    if (!password || !full_name || !username) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos: password, full_name, username' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanUsername = username.trim().toLowerCase()

    // Check username uniqueness across both profiles and admins
    const { data: usernameTaken, error: usernameCheckErr } = await callerClient
      .rpc('username_exists', { p_username: cleanUsername })

    if (usernameCheckErr) {
      // If the RPC function doesn't exist or fails, log it but don't block
      console.error('username_exists RPC error:', usernameCheckErr.message)
    }

    if (usernameTaken) {
      return new Response(
        JSON.stringify({ error: 'Ese nombre de usuario ya está en uso' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate placeholder email if not provided
    const finalEmail = email && email.trim()
      ? email.trim()
      : `${cleanUsername}-${Math.random().toString(36).slice(2, 8)}@noemail.mujeres.app`

    const role = is_admin ? 'admin' : 'user'

    // Verify service role key is available
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not set in edge function env')
      return new Response(
        JSON.stringify({ error: 'Error de configuración del servidor' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    )

    const { data: newUser, error } = await adminClient.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        username: cleanUsername,
        phone: phone?.trim() || null,
        role,
        password,
      },
    })

    if (error) {
      console.error('createUser error:', error.message, error.status)
      // Map common Supabase auth errors to friendly messages
      let friendlyMsg = error.message
      if (error.message.includes('already registered')) {
        friendlyMsg = 'Ya existe una cuenta con ese correo electrónico'
      } else if (error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
        friendlyMsg = 'Ese nombre de usuario o correo ya está en uso'
      }
      return new Response(
        JSON.stringify({ error: friendlyMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('Unhandled error:', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error desconocido del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
