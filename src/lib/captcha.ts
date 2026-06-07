import { supabase } from './supabase'

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'flexible' | 'compact'
        }
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit'

let scriptLoaded = false

export function loadTurnstile(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (scriptLoaded && window.turnstile) {
      resolve()
      return
    }

    if (document.querySelector(`script[src^="${TURNSTILE_SCRIPT_SRC.split('?')[0]}"]`)) {
      const checkLoaded = setInterval(() => {
        if (window.turnstile) {
          scriptLoaded = true
          clearInterval(checkLoaded)
          resolve()
        }
      }, 100)
      setTimeout(() => {
        clearInterval(checkLoaded)
        if (!window.turnstile) reject(new Error('Turnstile load timeout'))
      }, 10000)
      return
    }

    window.onTurnstileLoad = () => {
      scriptLoaded = true
      resolve()
    }

    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('Failed to load Turnstile script'))
    document.head.appendChild(script)
  })
}

export interface RenderOptions {
  container: HTMLElement
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
}

export function renderTurnstile({ container, onVerify, onError, onExpire }: RenderOptions): string {
  if (!window.turnstile) {
    throw new Error('Turnstile not loaded yet')
  }
  return window.turnstile.render(container, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: onVerify,
    'error-callback': onError,
    'expired-callback': onExpire,
    theme: 'light',
    size: 'flexible',
  })
}

export function resetTurnstile(widgetId?: string): void {
  window.turnstile?.reset(widgetId)
}

export function removeTurnstile(widgetId?: string): void {
  window.turnstile?.remove(widgetId)
}

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('verify-turnstile', {
    body: { token },
  })

  if (error) {
    console.error('verify-turnstile invoke error:', error)
    return false
  }
  return !!data?.ok
}

export function isCaptchaConfigured(): boolean {
  return !!import.meta.env.VITE_TURNSTILE_SITE_KEY
}
