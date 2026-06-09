import { useState, useEffect, useRef, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { supabase } from '../lib/supabase'
import {
  validatePassword,
  generatePlaceholderEmail,
  checkUsernameExists,
  getErrorMessage,
} from '../lib/queries'
import {
  loadTurnstile,
  renderTurnstile,
  resetTurnstile,
  removeTurnstile,
  verifyTurnstileToken,
  isCaptchaConfigured,
} from '../lib/captcha'
import SecurityQuestionsFlow, {
  type SecurityAnswers,
} from './SecurityQuestionsFlow'
import SubmitButton from './ui/SubmitButton'
import CancelButton from './ui/CancelButton'

type Step = 'form' | 'security' | 'privacy'

interface RegisterProps {
  onBack?: () => void
}

export default function Register({ onBack }: RegisterProps) {
  const [step, setStep] = useState<Step>('form')
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [repetirContrasena, setRepetirContrasena] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showRepeatPassword, setShowRepeatPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [securityAnswers, setSecurityAnswers] = useState<SecurityAnswers | null>(null)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{usuario?: string; contrasena?: string; repetirContrasena?: string}>({})
  const captchaContainerRef = useRef<HTMLDivElement | null>(null)
  const captchaWidgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (step !== 'form') return
    if (!isCaptchaConfigured()) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    // Wait a tick so AnimatePresence mode="wait" can finish mounting
    // the form (and the captcha container ref can be attached) before
    // we try to render the widget.
    timer = setTimeout(() => {
      if (cancelled) return
      if (captchaWidgetIdRef.current) return
      if (!captchaContainerRef.current) return

      // Clear the container in case a stale widget left residue
      captchaContainerRef.current.innerHTML = ''

      loadTurnstile()
        .then(() => {
          if (cancelled || !captchaContainerRef.current) return
          try {
            const id = renderTurnstile({
              container: captchaContainerRef.current!,
              onVerify: (token) => setCaptchaToken(token),
              onExpire: () => setCaptchaToken(null),
              onError: () => setCaptchaToken(null),
            })
            captchaWidgetIdRef.current = id
          } catch (e) {
            console.error('Turnstile render failed:', e)
          }
        })
        .catch((e) => {
          console.error('Turnstile load failed:', e)
        })
    }, 200)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (captchaWidgetIdRef.current) {
        try {
          removeTurnstile(captchaWidgetIdRef.current)
        } catch {
          /* noop */
        }
        captchaWidgetIdRef.current = null
      }
    }
  }, [step])

  const validateForm = (): string | null => {
    if (!nombre.trim()) return 'Ingresa tu nombre completo'
    if (!usuario.trim() || usuario.length < 3) return 'El usuario debe tener al menos 3 caracteres'
    if (!/^[a-zA-Z0-9_]+$/.test(usuario)) return 'El usuario solo puede tener letras, números y guiones bajos'

    const trimmedEmail = email.trim()
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return 'Ingresa un correo válido o déjalo vacío'
    }

    const pwdError = validatePassword(contrasena)
    if (pwdError) return pwdError

    if (!repetirContrasena) {
      return 'Repetí tu contraseña'
    }
    if (contrasena !== repetirContrasena) {
      return 'Las contraseñas no coinciden'
    }

    if (isCaptchaConfigured() && !captchaToken) {
      return 'Por favor completa la verificación anti-bots'
    }

    return null
  }

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const err = validateForm()
    if (err) {
      sileo.error({ title: 'Revisa los datos', description: err })
      return
    }

    setLoading(true)
    const exists = await checkUsernameExists(usuario)
    setLoading(false)

    if (exists) {
      sileo.error({
        title: 'Ese usuario ya está en uso',
        description: 'Probá con otro nombre de usuario',
      })
      return
    }

    setStep('security')
  }

  const handleSecurityComplete = (data: SecurityAnswers) => {
    setSecurityAnswers(data)
    setStep('privacy')
  }

  const handleSecurityCancel = () => {
    setSecurityAnswers(null)
    setStep('form')
  }

  const handlePrivacyAccept = async () => {
    setLoading(true)

    let finalEmail: string
    if (email.trim()) {
      finalEmail = email.trim()
    } else {
      finalEmail = generatePlaceholderEmail(usuario)
    }

    if (isCaptchaConfigured() && captchaToken) {
      const captchaOk = await verifyTurnstileToken(captchaToken)
      if (!captchaOk) {
        setLoading(false)
        sileo.error({
          title: 'No pudimos verificarte',
          description: 'Recargá la página y volvé a completar la verificación anti-bots',
        })
        if (captchaWidgetIdRef.current) resetTurnstile(captchaWidgetIdRef.current)
        setCaptchaToken(null)
        setStep('form')
        return
      }
    }

    const { error } = await supabase.auth.signUp({
      email: finalEmail,
      password: contrasena,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: nombre.trim(),
          username: usuario.trim().toLowerCase(),
          password: contrasena,
          sq1: securityAnswers?.q1 ?? '',
          sa1: securityAnswers?.a1 ?? null,
          sq2: securityAnswers?.q2 ?? '',
          sa2: securityAnswers?.a2 ?? null,
          sq3: securityAnswers?.q3 ?? '',
          sa3: securityAnswers?.a3 ?? null,
        },
      },
    })

    setLoading(false)

    if (error) {
      sileo.error({
        title: 'No pudimos crear tu cuenta',
        description: getErrorMessage(error, 'Revisá los datos e intentá de nuevo'),
      })
      if (captchaWidgetIdRef.current) resetTurnstile(captchaWidgetIdRef.current)
      setCaptchaToken(null)
      setStep('form')
      return
    }

    sileo.success({
      title: '¡Cuenta creada!',
      description: 'Bienvenida a Mujer-ES',
    })
  }

  return (
    <div className="register-flow">
      <AnimatePresence mode="wait">
        {step === 'form' && (
          <motion.div
            key="form"
            className="register-card"
            initial={{ opacity: 0, scale: 0.5, rotateX: 25 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotateX: -25 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="register-header">
              <div className="register-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
              <h2 className="register-title">Crear Cuenta</h2>
              <p className="register-subtitle">Empezá tu camino en Mujer-ES</p>
            </div>

            <form onSubmit={handleFormSubmit} className="register-form">
              <div className="login-field">
                <label htmlFor="reg-nombre">Nombre completo</label>
                <input
                  id="reg-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre completo"
                  autoComplete="name"
                />
              </div>
              <div className="login-field">
                <label htmlFor="reg-usuario">Usuario</label>
                <input
                  id="reg-usuario"
                  type="text"
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value.toLowerCase())
                    if (fieldErrors.usuario) setFieldErrors((prev) => ({ ...prev, usuario: undefined }))
                  }}
                  onBlur={() => {
                    if (usuario.trim() && usuario.trim().length < 3) {
                      setFieldErrors((prev) => ({ ...prev, usuario: 'Mínimo 3 caracteres' }))
                    }
                  }}
                  placeholder="Como te identifiques"
                  autoComplete="username"
                  className={fieldErrors.usuario ? 'field-invalid' : undefined}
                  style={{ borderColor: fieldErrors.usuario ? 'var(--color-error)' : undefined }}
                />
                {fieldErrors.usuario && <p className="field-error">{fieldErrors.usuario}</p>}
              </div>
              <div className="login-field">
                <label htmlFor="reg-email">
                  Correo <span className="login-field-optional">(opcional)</span>
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com (opcional)"
                  autoComplete="email"
                />
              </div>
              <div className="login-field">
                <label htmlFor="reg-contrasena">Contraseña</label>
                <div className="password-input-wrapper">
                  <input
                    id="reg-contrasena"
                    type={showPassword ? 'text' : 'password'}
                    value={contrasena}
                    onChange={(e) => {
                      setContrasena(e.target.value)
                      if (fieldErrors.contrasena) setFieldErrors((prev) => ({ ...prev, contrasena: undefined }))
                    }}
                    onBlur={() => {
                      if (contrasena && contrasena.length < 6) {
                        setFieldErrors((prev) => ({ ...prev, contrasena: 'Mínimo 6 caracteres' }))
                      }
                    }}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    className={fieldErrors.contrasena ? 'field-invalid' : undefined}
                    style={{ borderColor: fieldErrors.contrasena ? 'var(--color-error)' : undefined }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="password-toggle"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {fieldErrors.contrasena && <p className="field-error">{fieldErrors.contrasena}</p>}
                <p className="login-field-hint">Al menos 6 caracteres, una mayúscula y un número</p>
              </div>

              <div className="login-field">
                <label htmlFor="reg-repetir-contrasena">Repetir contraseña</label>
                <div className="password-input-wrapper">
                  <input
                    id="reg-repetir-contrasena"
                    type={showRepeatPassword ? 'text' : 'password'}
                    value={repetirContrasena}
                    onChange={(e) => {
                      setRepetirContrasena(e.target.value)
                      if (fieldErrors.repetirContrasena) setFieldErrors((prev) => ({ ...prev, repetirContrasena: undefined }))
                    }}
                    onBlur={() => {
                      if (repetirContrasena && repetirContrasena !== contrasena) {
                        setFieldErrors((prev) => ({ ...prev, repetirContrasena: 'Las contraseñas no coinciden' }))
                      }
                    }}
                    placeholder="Repetí tu contraseña"
                    autoComplete="new-password"
                    className={fieldErrors.repetirContrasena ? 'field-invalid' : undefined}
                    style={{ borderColor: fieldErrors.repetirContrasena ? 'var(--color-error)' : undefined }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRepeatPassword((s) => !s)}
                    className="password-toggle"
                    aria-label={showRepeatPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showRepeatPassword}
                    tabIndex={-1}
                  >
                    {showRepeatPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {fieldErrors.repetirContrasena && <p className="field-error">{fieldErrors.repetirContrasena}</p>}
              </div>

              {isCaptchaConfigured() && (
                <div className="register-captcha-section">
                  <p className="register-captcha-label">Verificación de seguridad</p>
                  <div className="register-captcha">
                    <div ref={captchaContainerRef} className="cf-turnstile" />
                  </div>
                </div>
              )}

              <SubmitButton loading={loading}>Continuar</SubmitButton>
            </form>

            {onBack && (
              <button onClick={onBack} className="volver-btn" type="button">
                <div className="volver-btn-bg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="25px" width="25px">
                    <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
                    <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
                  </svg>
                </div>
                <p className="volver-btn-text">Volver</p>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {step === 'security' && (
        <SecurityQuestionsFlow
          onComplete={handleSecurityComplete}
          onCancel={handleSecurityCancel}
        />
      )}

      {step === 'privacy' &&
        createPortal(
          <motion.div
            className="privacy-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="privacy-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Política de privacidad"
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className="privacy-modal-icon">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className="privacy-modal-title">Tu privacidad es importante</h3>
              <p className="privacy-modal-text">
                Toda la información que nos compartas es trabajada de forma sensible y confidencial.
                Nadie tendrá acceso a esta información privada.
              </p>
              <p className="privacy-modal-text-small">
                Tus datos están protegidos con nuestros sistemas de seguridad.
              </p>
              <SubmitButton
                onClick={handlePrivacyAccept}
                loading={loading}
              >
                Aceptar y crear cuenta
              </SubmitButton>
              <CancelButton
                onClick={() => setStep('form')}
                disabled={loading}
              >
                Cancelar
              </CancelButton>
            </motion.div>
          </motion.div>,
          document.body
        )}
    </div>
  )
}
