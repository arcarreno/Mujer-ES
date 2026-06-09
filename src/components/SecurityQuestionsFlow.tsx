import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { normalizeAnswer } from '../lib/normalize'
import SubmitButton from './ui/SubmitButton'
import CancelButton from './ui/CancelButton'

/**
 * The 3 fixed security questions (shown in the modal text).
 * Stored as the question text in the DB so we can change them
 * in one place.
 */
export const SECURITY_QUESTIONS = [
  '¿Cuál es el nombre de tu primera mascota?',
  '¿Cómo se llamaba tu mejor amigo o amiga de la infancia?',
  '¿En qué ciudad nació tu mamá?',
] as const

export interface SecurityAnswers {
  q1: string
  a1: string // normalized, or '' if user picked N/A
  q2: string
  a2: string
  q3: string
  a3: string
}

type QuestionIndex = 0 | 1 | 2
type SQStep = 'notice' | { kind: 'question'; index: QuestionIndex }

interface SecurityQuestionsFlowProps {
  onComplete: (data: SecurityAnswers) => void
  onCancel: () => void
}

type AnswerMode = 'na' | 'other'

export default function SecurityQuestionsFlow({
  onComplete,
  onCancel,
}: SecurityQuestionsFlowProps) {
  const [step, setStep] = useState<SQStep>('notice')
  const [understand, setUnderstand] = useState(false)
  const [modes, setModes] = useState<AnswerMode[]>(['na', 'na', 'na'])
  const [answers, setAnswers] = useState<[string, string, string]>(['', '', ''])
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)

  // Escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  // Auto-focus the input when user picks "Otra respuesta"
  useEffect(() => {
    if (step !== 'notice' && modes[step.index] === 'other') {
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [step, modes])

  const handleContinue = () => {
    setError(null)

    if (step === 'notice') {
      if (!understand) return
      setStep({ kind: 'question', index: 0 })
      return
    }

    // Here, step is guaranteed to be the question variant
    const idx = step.index
    const mode = modes[idx]

    if (mode === 'other') {
      const ans = answers[idx].trim()
      if (ans.length < 2) {
        setError('Ingresá una respuesta válida (al menos 2 caracteres)')
        return
      }
    }

    if (idx < 2) {
      setStep({ kind: 'question', index: (idx + 1) as QuestionIndex })
    } else {
      // Last question, complete
      const result: SecurityAnswers = {
        q1: SECURITY_QUESTIONS[0],
        a1: modes[0] === 'na' ? '' : normalizeAnswer(answers[0]),
        q2: SECURITY_QUESTIONS[1],
        a2: modes[1] === 'na' ? '' : normalizeAnswer(answers[1]),
        q3: SECURITY_QUESTIONS[2],
        a3: modes[2] === 'na' ? '' : normalizeAnswer(answers[2]),
      }
      onComplete(result)
    }
  }

  const handleBack = () => {
    setError(null)
    if (step === 'notice') return
    if (step.index === 0) {
      setStep('notice')
    } else {
      setStep({ kind: 'question', index: (step.index - 1) as QuestionIndex })
    }
  }

  const setMode = (idx: QuestionIndex, value: AnswerMode) => {
    setModes((prev) => {
      const next: AnswerMode[] = [...prev]
      next[idx] = value
      return next
    })
    setError(null)
  }

  const setAnswer = (idx: QuestionIndex, value: string) => {
    const normalized = normalizeAnswer(value)
    setAnswers((prev) => {
      const next: [string, string, string] = [...prev]
      next[idx] = normalized
      return next
    })
    setError(null)
  }

  // The question step is the only place we need an index
  const questionStep = step !== 'notice' ? step : null
  const isLast = questionStep !== null && questionStep.index === 2
  const continueLabel = isLast ? 'Finalizar' : 'Siguiente'
  const continueDisabled =
    step === 'notice'
      ? !understand
      : modes[step.index] === 'other' &&
        answers[step.index].trim().length < 2

  return createPortal(
    <AnimatePresence mode="wait">
      {step === 'notice' ? (
        <motion.div
          key="notice"
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
            aria-label="Preguntas de seguridad"
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 16 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="privacy-modal-icon">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h3 className="privacy-modal-title">Antes de continuar</h3>
            <p className="privacy-modal-text">
              La siguiente información se utilizará únicamente para
              recuperar tu cuenta en caso de que olvides tu contraseña.
            </p>
            <p className="privacy-modal-text">
              Tus respuestas se guardan de forma segura y confidencial.
              No las compartas con nadie.
            </p>
            <p className="privacy-modal-text-small">
              Las respuestas se escriben en minúsculas, sin acentos ni
              símbolos como - . , @.
            </p>

            <label className="sq-checkbox">
              <input
                type="checkbox"
                checked={understand}
                onChange={(e) => setUnderstand(e.target.checked)}
              />
              <span>Entendí</span>
            </label>

            <SubmitButton
              onClick={handleContinue}
              disabled={continueDisabled}
            >
              Continuar
            </SubmitButton>
            <CancelButton onClick={onCancel}>Cancelar</CancelButton>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key={`q${step.index}`}
          className="privacy-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={handleBack}
        >
          <motion.div
            className="privacy-modal"
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 16 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="privacy-modal-icon">
              <svg
                width="36"
                height="36"
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
            <h3 className="privacy-modal-title">Pregunta de seguridad</h3>
            <p className="privacy-modal-text">
              {SECURITY_QUESTIONS[step.index]}
            </p>
            <p className="privacy-modal-text-small">
              Si no aplica, elegí &quot;N/A&quot; en el menú.
            </p>

            <div className="login-field">
              <select
                value={modes[step.index]}
                onChange={(e) =>
                  setMode(step.index, e.target.value as AnswerMode)
                }
                className="form-input form-select"
              >
                <option value="na">N/A</option>
                <option value="other">Otra respuesta</option>
              </select>
            </div>

            {modes[step.index] === 'other' && (
              <div className="login-field">
                <input
                  ref={inputRef}
                  type="text"
                  value={answers[step.index]}
                  onChange={(e) => setAnswer(step.index, e.target.value)}
                  placeholder="Tu respuesta"
                  className="form-input"
                  autoComplete="off"
                  maxLength={60}
                />
              </div>
            )}

            {error && <p className="sq-error">{error}</p>}

            <SubmitButton
              onClick={handleContinue}
              disabled={continueDisabled}
            >
              {continueLabel}
            </SubmitButton>
            <CancelButton onClick={handleBack} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
