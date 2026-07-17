import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail, isSmtpConfigured } from "../_shared/smtp.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function buildWelcomeEmailHtml(email: string, password: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; background: #fafafa; padding: 40px 20px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; padding: 40px 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
    <h1 style="color: #581C87; font-size: 32px; margin: 0 0 4px; font-style: italic; font-weight: 600;">Mujer-ES</h1>
    <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 400; margin: 0 0 28px;">Tu cuenta ha sido creada</h2>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
      Bienvenida a Mujer-ES. Estas son tus credenciales para ingresar a la plataforma:
    </p>
    <div style="background: #f5f3ff; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280;">
        <strong style="color: #1a1a1a;">Correo:</strong><br>
        <span style="font-size: 16px; color: #581C87; word-break: break-all;">${email}</span>
      </p>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        <strong style="color: #1a1a1a;">Contraseña inicial:</strong><br>
        <span style="font-size: 16px; color: #581C87; word-break: break-all;">${password}</span>
      </p>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 24px 0 0; text-align: center;">
      Al iniciar sesión por primera vez, el sistema te pedirá que crees una contraseña nueva.<br>
      Si no solicitaste esta cuenta, podés ignorar este mensaje.
    </p>
  </div>
</body>
</html>`
}

function buildWelcomeEmailText(email: string, password: string): string {
  return `Bienvenida a Mujer-ES
Tu cuenta ha sido creada

Correo: ${email}
Contraseña inicial: ${password}

Al iniciar sesión por primera vez, el sistema te pedirá que crees una contraseña nueva.
Si no solicitaste esta cuenta, podés ignorar este mensaje.`
}

async function sendWelcomeEmail(to: string, password: string): Promise<void> {
  if (!isSmtpConfigured()) {
    console.warn("SMTP not configured — skipping welcome email")
    return
  }
  await sendEmail(
    to,
    "Bienvenida a Mujer-ES — tus credenciales",
    buildWelcomeEmailHtml(to, password),
    { text: buildWelcomeEmailText(to, password) },
  )
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

    // Send welcome email
    let emailStatus: 'ok' | 'skipped' | 'error' = 'skipped'
    try {
      await sendWelcomeEmail(finalEmail, initialPassword)
      emailStatus = 'ok'
    } catch (emailErr) {
      console.error('sendWelcomeEmail error:', emailErr)
      emailStatus = 'error'
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user: newUser.user,
        initial_password: initialPassword,
        email_sent: emailStatus,
      }),
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
