import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { signInWithIdentifier } from '../lib/queries'
import Register from './Register'
import RecoveryFlow from './recovery/RecoveryFlow'
import SubmitButton from './ui/SubmitButton'

interface LoginProps {
  onBack?: () => void
}

export default function Login({ onBack }: LoginProps) {
  const [identifier, setIdentifier] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim() || !contrasena) {
      sileo.error({ title: 'Faltan datos', description: 'Completá usuario o correo y contraseña' })
      return
    }
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
      description: 'Iniciando sesión...',
    })
  }

  return (
    <div className="login-container" style={{ perspective: '1000px' }}>
      <AnimatePresence mode="wait">
        {!showRegister ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.5, rotateX: 25 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotateX: -25 }}
            transition={{ duration: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h2 className="login-title">Iniciar Sesión</h2>
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="identifier">Usuario o correo</label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="tu_usuario o tu@correo.com"
                  autoComplete="username"
                />
              </div>
              <div className="login-field">
                <label htmlFor="contrasena">Contraseña</label>
                <div className="password-input-wrapper">
                  <input
                    id="contrasena"
                    type={showPassword ? 'text' : 'password'}
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
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
              <button
                onClick={() => setShowRegister(true)}
                className="login-link login-link-btn"
              >
                Crear cuenta
              </button>
            </div>
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
        ) : (
          <motion.div
            key="register"
            initial={{ opacity: 0, scale: 0.5, rotateX: 25 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotateX: -25 }}
            transition={{ duration: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <Register onBack={() => setShowRegister(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForgot && (
          <RecoveryFlow
            key="recovery-flow"
            onClose={() => setShowForgot(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
