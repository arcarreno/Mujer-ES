import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function buildRecoveryEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; background: #fafafa; padding: 40px 20px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; padding: 40px 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
    <h1 style="color: #581C87; font-size: 32px; margin: 0 0 4px; font-style: italic; font-weight: 600;">Mujer-ES</h1>
    <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 400; margin: 0 0 28px;">Restablecer contraseña</h2>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
      Ingresá este código en la app para restablecer tu contraseña:
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <div style="display: inline-block; font-size: 36px; letter-spacing: 8px; padding: 20px 36px; background: #f5f3ff; border-radius: 12px; font-family: 'Courier New', monospace; color: #581C87; font-weight: 700;">
        ${code}
      </div>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 32px 0 0; text-align: center;">
      El código expira en 10 minutos.<br>
      Si no solicitaste esto, podés ignorar este mensaje.
    </p>
  </div>
</body>
</html>`
}

async function sendEmailViaResend(to: string, html: string): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to,
      subject: "Tu código de recuperación - Mujer-ES",
      html,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("Resend API error:", response.status, errorText)
    throw new Error(`Error al enviar el email: ${response.status}`)
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Resend no está configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { email } = await req.json()
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const cleanEmail = email.trim().toLowerCase()

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Error de configuración del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    )

    const { data: userIdRow, error: lookupErr } = await supabase
      .rpc("get_user_id_by_email", { p_email: cleanEmail })
      .maybeSingle()

    if (lookupErr) {
      console.error("get_user_id_by_email error:", lookupErr)
      return new Response(
        JSON.stringify({ error: "Error al buscar el usuario" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!userIdRow) {
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: insertErr } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: userIdRow.user_id,
        token: code,
        expires_at: expiresAt,
      })

    if (insertErr) {
      console.error("insert code error:", insertErr)
      return new Response(
        JSON.stringify({ error: "Error al guardar el código" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    await sendEmailViaResend(cleanEmail, buildRecoveryEmailHtml(code))

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e) {
    console.error("Unhandled error:", e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
