import { useState, useEffect, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { signInWithIdentifier } from '../lib/queries'
import LoadingFallback from './ui/LoadingFallback'
import SubmitButton from './ui/SubmitButton'

const RecoveryFlow = lazy(() => import('./recovery/RecoveryFlow'))

interface LoginProps {
  onBack?: () => void
}

export default function Login({ onBack }: LoginProps) {
  const [identifier, setIdentifier] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{identifier?: string; password?: string}>({})
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const expandedVisual = !isMobile && showForgot

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: {identifier?: string; password?: string} = {}
    if (!identifier.trim()) errors.identifier = 'Este campo es obligatorio'
    if (!contrasena) errors.password = 'Este campo es obligatorio'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setLoading(true)

    const { user, error } = await signInWithIdentifier(identifier, contrasena)

    setLoading(false)

    if (error || !user) {
      sileo.error({
        title: 'No pudimos iniciar sesión',
        description: error ?? 'Revisá tus datos e intentá de nuevo',
      })
      return
    }

    sileo.success({
      title: '¡Bienvenida de vuelta!',
      description: 'Ya estas adentro de tu cuenta 💜',
    })
  }

  return (
    <motion.div
      className="login-fullpage"
      animate={{
        gridTemplateColumns: expandedVisual ? '0fr 1fr' : '1fr 1fr',
      }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* SVG clip-path for wavy left edge — subtle oscillation */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="wave-clip" clipPathUnits="objectBoundingBox">
            <path d="
              M0,0
              C0.06,0.04 0.1,0.1 0.1,0.17
              C0.1,0.25 0.03,0.32 0.03,0.42
              C0.03,0.52 0.1,0.58 0.1,0.67
              C0.1,0.76 0.03,0.83 0.03,0.9
              C0.03,0.95 0,1 0,1
              L1,1 L1,0 Z
            " />
          </clipPath>
        </defs>
      </svg>

      {/* Left side — Form */}
      <motion.div
        className="login-form-side"
        animate={{ opacity: expandedVisual ? 0 : 1 }}
        transition={{ duration: expandedVisual ? 0.3 : 0.5, ease: 'easeInOut' }}
        style={{ overflow: expandedVisual ? 'hidden' : 'auto' }}
      >
        <div className="login-form-wrapper">
          {onBack && (
            <button onClick={onBack} className="volver-btn-sm" type="button">
              <div className="volver-btn-sm-bg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
                  <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
                  <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
                </svg>
              </div>
              <p className="volver-btn-sm-text">Volver</p>
            </button>
          )}

          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h2 className="login-title">Iniciar Sesión</h2>
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="identifier">Usuario o correo</label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value)
                    if (fieldErrors.identifier) setFieldErrors((prev) => ({ ...prev, identifier: undefined }))
                  }}
                  placeholder="tu_usuario o tu@correo.com"
                  autoComplete="username"
                  className={fieldErrors.identifier ? 'field-invalid' : undefined}
                  style={{ borderColor: fieldErrors.identifier ? 'var(--color-error)' : undefined }}
                />
                {fieldErrors.identifier && <p className="field-error">{fieldErrors.identifier}</p>}
              </div>
              <div className="login-field">
                <label htmlFor="contrasena">Contraseña</label>
                <div className="password-input-wrapper">
                  <input
                    id="contrasena"
                    type={showPassword ? 'text' : 'password'}
                    value={contrasena}
                    onChange={(e) => {
                      setContrasena(e.target.value)
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
                    }}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
                    className={fieldErrors.password ? 'field-invalid' : undefined}
                    style={{ borderColor: fieldErrors.password ? 'var(--color-error)' : undefined }}
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
                {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
              </div>
              <SubmitButton loading={loading}>Entrar</SubmitButton>
            </form>
            <div className="login-links">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="login-link login-link-btn"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Right side — Visual */}
      <div className="login-visual-side">
        <div className="login-visual-content">
          <iframe
            src="https://my.spline.design/roomgirlworkingcopy-nBHQyrouGG0A486OpeB5Hz9A/"
            className="login-visual-spline"
            title="Spline 3D"
          />
          <p className="login-visual-text">TU LUZ SIGUE AHI</p>
        </div>
      </div>

      <AnimatePresence>
        {showForgot && (
          <Suspense fallback={<LoadingFallback />}>
            <RecoveryFlow
              key="recovery-flow"
              onClose={() => setShowForgot(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
