// supabase/functions/send-email-hook/index.ts
// Auth Hook: "Send Email" — intercepta emails de Supabase y los personaliza.
// Verifica la firma HMAC enviada por Supabase en el header x-supabase-signature.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const WEBHOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? ''

function getSecretBytes(secret: string): Uint8Array {
  const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  try {
    const binary = atob(cleanSecret)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    console.log('Secret decoded', { cleanLen: cleanSecret.length, byteLen: bytes.length })
    return bytes
  } catch (e) {
    console.log('Secret decode failed, using raw bytes', { error: String(e) })
    return new TextEncoder().encode(cleanSecret)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function verifySignature(body: string, signatureHeader: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    console.log('No secret configured, skipping verification')
    return true
  }
  if (!signatureHeader) {
    console.log('No signature header')
    return false
  }

  const parts = signatureHeader.split(',')
  console.log('Signature header parts', { count: parts.length, first: parts[0] })

  if (parts.length < 2 || parts[0] !== 'v1') return false

  const providedSignature = parts[1].trim()

  const keyBytes = getSecretBytes(WEBHOOK_SECRET)
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body)
  )
  const computedSignature = bytesToBase64(new Uint8Array(signature))
  const computedSignatureUrl = bytesToBase64Url(new Uint8Array(signature))

  console.log('Signature compare', {
    provided: providedSignature.substring(0, 20) + '...',
    providedLen: providedSignature.length,
    computedStandard: computedSignature.substring(0, 20) + '...',
    computedStandardLen: computedSignature.length,
    computedUrl: computedSignatureUrl.substring(0, 20) + '...',
    computedUrlLen: computedSignatureUrl.length,
    matchStandard: timingSafeEqual(computedSignature, providedSignature),
    matchUrl: timingSafeEqual(computedSignatureUrl, providedSignature),
  })

  return (
    timingSafeEqual(computedSignature, providedSignature) ||
    timingSafeEqual(computedSignatureUrl, providedSignature)
  )
}

interface SendEmailHookPayload {
  user: { email: string; user_metadata?: Record<string, unknown> }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

function buildSignupEmail(code: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; background: #fafafa; padding: 40px 20px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; padding: 40px 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
    <h1 style="color: #581C87; font-size: 32px; margin: 0 0 4px; font-style: italic; font-weight: 600;">Mujer-ES</h1>
    <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 400; margin: 0 0 28px;">Confirma tu correo</h2>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
      Ingresá este código en la app para verificar tu cuenta:
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <div style="display: inline-block; font-size: 36px; letter-spacing: 8px; padding: 20px 36px; background: #f5f3ff; border-radius: 12px; font-family: 'Courier New', monospace; color: #581C87; font-weight: 700;">
        ${code}
      </div>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 32px 0 0; text-align: center;">
      El código expira en 1 hora.<br>
      Si no solicitaste esto, podés ignorar este mensaje.
    </p>
  </div>
</body>
</html>`
}

function buildRecoveryEmail(code: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; background: #fafafa; padding: 40px 20px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; padding: 40px 32px; border-radius: 12px;">
    <h1 style="color: #581C87; font-size: 32px; margin: 0 0 4px; font-style: italic; font-weight: 600;">Mujer-ES</h1>
    <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 400; margin: 0 0 28px;">Restablecer contraseña</h2>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
      Tu código para restablecer la contraseña es:
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <div style="display: inline-block; font-size: 36px; letter-spacing: 8px; padding: 20px 36px; background: #f5f3ff; border-radius: 12px; font-family: 'Courier New', monospace; color: #581C87; font-weight: 700;">
        ${code}
      </div>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 32px 0 0; text-align: center;">
      El código expira en 1 hora.<br>
      Si no solicitaste esto, podés ignorar este mensaje.
    </p>
  </div>
</body>
</html>`
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  console.log('=== Hook called ===', { method: req.method, url: req.url })

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('x-supabase-signature')
    const authHeader = req.headers.get('authorization')

    console.log('Headers', {
      hasSignature: !!signature,
      signatureStart: signature?.substring(0, 30),
      hasAuth: !!authHeader,
      bodyLength: body.length,
    })

    const isValid = await verifySignature(body, signature)
    console.log('Verification result', { isValid })

    if (!isValid) {
      return jsonResponse({ error: 'Invalid signature' }, 401)
    }

    const payload: SendEmailHookPayload = JSON.parse(body)
    const { user, email_data } = payload

    console.log('Email action', {
      type: email_data.email_action_type,
      to: user.email,
    })

    if (email_data.email_action_type === 'signup') {
      return jsonResponse({
        email: {
          to: user.email,
          subject: 'Tu código de verificación - Mujer-ES',
          html: buildSignupEmail(email_data.token),
        },
      })
    }

    if (email_data.email_action_type === 'recovery') {
      return jsonResponse({
        email: {
          to: user.email,
          subject: 'Restablecer contraseña - Mujer-ES',
          html: buildRecoveryEmail(email_data.token),
        },
      })
    }

    return jsonResponse({})
  } catch (e) {
    console.error('Hook error:', e)
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      500
    )
  }
})
