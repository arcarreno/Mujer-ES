import { useState, useEffect, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import {
  sendRecoveryCode,
  verifyRecoveryCode,
  getEmailByUsername,
  isEmail,
  getErrorMessage,
} from '../../lib/queries'
import ModifyPassword from './ModifyPassword'
import SubmitButton from '../ui/SubmitButton'
import CancelButton from '../ui/CancelButton'

type RecoveryStep =
  | { kind: 'request' }
  | { kind: 'verify'; email: string }
  | { kind: 'modify'; resetToken: string }
  | { kind: 'done' }

interface RecoveryFlowProps {
  onClose: () => void
}

export default function RecoveryFlow({ onClose }: RecoveryFlowProps) {
  const [step, setStep] = useState<RecoveryStep>({ kind: 'request' })
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = identifier.trim()
    if (!trimmed) {
      sileo.error({
        title: 'Falta el dato',
        description: 'Ingresá tu correo electrónico o nombre de usuario',
      })
      return
    }

    setLoading(true)
    try {
      let email = trimmed
      if (!isEmail(email)) {
        const resolved = await getEmailByUsername(email)
        if (!resolved) {
          setLoading(false)
          sileo.error({
            title: 'No encontramos tu cuenta',
            description: 'Verificá el usuario o correo e intentá de nuevo',
          })
          return
        }
        email = resolved
      }

      await sendRecoveryCode(email)
      sileo.success({
        title: 'Código enviado',
        description: 'Revisá tu correo (incluyendo spam). El código expira en 10 minutos.',
      })
      setStep({ kind: 'verify', email })
    } catch (e) {
      sileo.error({
        title: 'No pudimos enviar el código',
        description: getErrorMessage(e, 'Intentá de nuevo en unos minutos'),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (step.kind !== 'verify') return

    setResending(true)
    try {
      await sendRecoveryCode(step.email)
      sileo.success({
        title: 'Código reenviado',
        description: 'Revisá tu correo. El código expira en 10 minutos.',
      })
    } catch (e) {
      sileo.error({
        title: 'No pudimos reenviar el código',
        description: getErrorMessage(e, 'Intentá de nuevo en unos minutos'),
      })
    } finally {
      setResending(false)
    }
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (step.kind !== 'verify') return

    const trimmedCode = code.trim()
    if (trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      sileo.error({
        title: 'Código inválido',
        description: 'Ingresá el código de 6 dígitos que recibiste por correo',
      })
      return
    }

    setLoading(true)
    try {
      const result = await verifyRecoveryCode(step.email, trimmedCode)
      setStep({ kind: 'modify', resetToken: result.reset_token })
    } catch (e) {
      sileo.error({
        title: 'Código incorrecto',
        description: getErrorMessage(e, 'Verificá el código e intentá de nuevo'),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleModifyComplete = () => {
    setStep({ kind: 'done' })
  }

  const handleBackdropClick = () => {
    if (loading || resending) return
    if (step.kind === 'request') {
      onClose()
    } else if (step.kind === 'verify') {
      setStep({ kind: 'request' })
    }
  }

  return (
    <>
      {step.kind === 'request' &&
        createPortal(
          <motion.div
            key="request"
            className="privacy-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            onClick={handleBackdropClick}
          >
            <motion.div
              className="privacy-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Recuperar contraseña"
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="privacy-modal-icon">
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
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h3 className="privacy-modal-title">Recuperar contraseña</h3>
              <p className="privacy-modal-text">
                Ingresá tu correo o nombre de usuario. Te enviaremos un
                código de 6 dígitos para restablecer tu contraseña.
              </p>
              <form onSubmit={handleRequest} className="forgot-form">
                <div className="login-field">
                  <label htmlFor="recovery-identifier">
                    Correo o usuario
                  </label>
                  <input
                    id="recovery-identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="tu@correo.com o tu_usuario"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                <SubmitButton
                  type="submit"
                  loading={loading}
                >
                  Enviar código
                </SubmitButton>
              </form>
              <CancelButton onClick={onClose} disabled={loading}>
                Cancelar
              </CancelButton>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {step.kind === 'verify' &&
        createPortal(
          <motion.div
            key="verify"
            className="privacy-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            onClick={handleBackdropClick}
          >
            <motion.div
              className="privacy-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Verificar código"
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="privacy-modal-icon">
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
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className="privacy-modal-title">Código de verificación</h3>
              <p className="privacy-modal-text">
                Ingresá el código de 6 dígitos que enviamos a{" "}
                <strong>{step.email}</strong>
              </p>
              <form onSubmit={handleVerify} className="forgot-form">
                <div className="login-field">
                  <label htmlFor="recovery-code">Código</label>
                  <input
                    id="recovery-code"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setCode(val)
                    }}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    autoFocus
                    className="recovery-code-input"
                    style={{
                      textAlign: 'center',
                      fontSize: '1.5rem',
                      letterSpacing: '8px',
                      fontFamily: "'Courier New', monospace",
                    }}
                  />
                </div>
                <SubmitButton
                  type="submit"
                  loading={loading}
                  disabled={code.length !== 6}
                >
                  Verificar código
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="recovery-resend-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary, #581C87)',
                  cursor: resending ? 'default' : 'pointer',
                  fontSize: '0.875rem',
                  marginTop: '8px',
                  textDecoration: 'underline',
                  opacity: resending ? 0.6 : 1,
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                {resending ? 'Reenviando...' : 'Reenviar código'}
              </button>
              <CancelButton
                onClick={() => setStep({ kind: 'request' })}
                disabled={loading}
              >
                Volver
              </CancelButton>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {step.kind === 'modify' && (
        <ModifyPassword
          key="modify"
          resetToken={step.resetToken}
          onComplete={handleModifyComplete}
          onClose={() => setStep({ kind: 'done' })}
        />
      )}

      {step.kind === 'done' &&
        createPortal(
          <motion.div
            key="done"
            className="privacy-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          >
            <motion.div
              className="privacy-modal"
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="privacy-modal-icon">
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
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3 className="privacy-modal-title">¡Contraseña actualizada!</h3>
              <p className="privacy-modal-text">
                Ya podés iniciar sesión con tu nueva contraseña.
              </p>
              <SubmitButton onClick={onClose}>
                Listo
              </SubmitButton>
            </motion.div>
          </motion.div>,
          document.body
        )}
    </>
  )
}
