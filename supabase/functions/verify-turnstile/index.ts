// supabase/functions/verify-turnstile/index.ts
// Verifica el token de Cloudflare Turnstile enviado desde el frontend.
// Desplegar con: supabase functions deploy verify-turnstile --no-verify-jwt
// Requiere secret: TURNSTILE_SECRET_KEY (en supabase secrets set)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TurnstileSiteVerifyResponse {
  success: boolean
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
  action?: string
  cdata?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const secret = Deno.env.get('TURNSTILE_SECRET_KEY')

    if (!secret) {
      console.error('TURNSTILE_SECRET_KEY not configured')
      return new Response(
        JSON.stringify({ ok: false, error: 'CAPTCHA not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formData = new FormData()
    formData.append('secret', secret)
    formData.append('response', token)

    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: formData }
    )

    const result: TurnstileSiteVerifyResponse = await verifyRes.json()

    if (!result.success) {
      console.log('Turnstile failed', { errors: result['error-codes'] })
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'CAPTCHA verification failed',
          details: result['error-codes'],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
