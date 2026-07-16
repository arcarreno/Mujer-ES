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

    const { email, full_name, username, phone, is_admin } = await req.json()
    if (!email || !email.trim()) {
      return new Response(JSON.stringify({ error: 'El correo electrónico es obligatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const finalEmail = email.trim().toLowerCase()
    const cleanUsername = username?.trim().toLowerCase() || finalEmail.split('@')[0].replace(/[^a-z0-9]/g, '_')
    const cleanFullName = full_name?.trim() || cleanUsername

    // Check username uniqueness across both profiles and admins
    const { data: usernameTaken } = await callerClient
      .rpc('username_exists', { p_username: cleanUsername })

    if (usernameTaken) {
      return new Response(
        JSON.stringify({ error: 'Ese nombre de usuario ya está en uso' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const role = is_admin ? 'admin' : 'user'

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

    // The email itself is the initial password
    const initialPassword = finalEmail

    const { data: newUser, error } = await adminClient.auth.admin.createUser({
      email: finalEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
        username: cleanUsername,
        phone: phone?.trim() || null,
        role,
      },
    })

    if (error) {
      console.error('createUser error:', error.message, error.status)
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
      JSON.stringify({ ok: true, user: newUser.user, initial_password: initialPassword }),
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
