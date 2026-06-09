import { useState, useEffect, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import {
  getSecurityQuestions,
  getErrorMessage,
  type SecurityQuestionsData,
} from '../../lib/queries'
import SecurityQuestions from './SecurityQuestions'
import PasswordOptions from './PasswordOptions'
import ViewPassword from './ViewPassword'
import ModifyPassword from './ModifyPassword'
import SubmitButton from '../ui/SubmitButton'
import CancelButton from '../ui/CancelButton'

type RecoveryStep =
  | { kind: 'request' }
  | { kind: 'questions'; identifier: string; questions: SecurityQuestionsData }
  | { kind: 'options'; resetToken: string }
  | { kind: 'view'; resetToken: string }
  | { kind: 'modify'; resetToken: string }
  | { kind: 'done' }

interface RecoveryFlowProps {
  onClose: () => void
}

export default function RecoveryFlow({ onClose }: RecoveryFlowProps) {
  const [step, setStep] = useState<RecoveryStep>({ kind: 'request' })
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)

  // Escape key to close
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
      const questions = await getSecurityQuestions(trimmed)
      if (!questions) {
        sileo.error({
          title: 'No encontramos tu cuenta',
          description: 'Verificá el usuario o correo e intentá de nuevo',
        })
        return
      }
      // No questions configured → must contact foundation
      if (
        !questions.has_answer_1 &&
        !questions.has_answer_2 &&
        !questions.has_answer_3
      ) {
        sileo.error({
          title: 'No configuraste preguntas de seguridad',
          description:
            'Contactá a la fundación para recuperar tu contraseña',
        })
        return
      }
      setIdentifier(trimmed)
      setStep({ kind: 'questions', identifier: trimmed, questions })
    } catch (e) {
      sileo.error({
        title: 'No pudimos verificar tu cuenta',
        description: getErrorMessage(
          e,
          'Intentá de nuevo en unos minutos',
        ),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBackdropClick = () => {
    if (loading) return
    if (step.kind === 'request') {
      onClose()
    } else if (step.kind === 'questions') {
      setStep({ kind: 'request' })
    } else if (step.kind === 'options') {
      onClose()
    }
    // Don't close on view/modify (loading)
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
                Ingresá tu correo o nombre de usuario. Te pediremos
                responder las preguntas de seguridad que configuraste
                al crear tu cuenta.
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
                  Continuar
                </SubmitButton>
              </form>
              <CancelButton onClick={onClose} disabled={loading}>
                Cancelar
              </CancelButton>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {step.kind === 'questions' && (
        <SecurityQuestions
          key="questions"
          identifier={step.identifier}
          questions={step.questions}
          onVerified={(token) =>
            setStep({ kind: 'options', resetToken: token })
          }
          onBack={() => setStep({ kind: 'request' })}
        />
      )}

      {step.kind === 'options' && (
        <PasswordOptions
          key="options"
          onView={() =>
            setStep((s) =>
              s.kind === 'options'
                ? { kind: 'view', resetToken: s.resetToken }
                : s,
            )
          }
          onModify={() =>
            setStep((s) =>
              s.kind === 'options'
                ? { kind: 'modify', resetToken: s.resetToken }
                : s,
            )
          }
          onClose={() => setStep({ kind: 'done' })}
        />
      )}

      {step.kind === 'view' && (
        <ViewPassword
          key="view"
          resetToken={step.resetToken}
          onClose={() => setStep({ kind: 'done' })}
        />
      )}

      {step.kind === 'modify' && (
        <ModifyPassword
          key="modify"
          resetToken={step.resetToken}
          onComplete={() => setStep({ kind: 'done' })}
          onClose={() =>
            setStep((s) =>
              s.kind === 'modify'
                ? { kind: 'options', resetToken: s.resetToken }
                : s,
            )
          }
        />
      )}
    </>
  )
}
