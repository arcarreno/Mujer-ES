import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
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

interface SecurityQuestionsFlowProps {
  onComplete: (data: SecurityAnswers) => void
  onCancel: () => void
}

type AnswerMode = 'na' | 'other'

export default function SecurityQuestionsFlow({
  onComplete,
  onCancel,
}: SecurityQuestionsFlowProps) {
  // stepNum: 0=notice, 1=Q1, 2=Q2, 3=Q3
  const [stepNum, setStepNum] = useState(0)
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
    if (stepNum > 0 && modes[stepNum - 1] === 'other') {
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [stepNum, modes])

  const handleContinue = () => {
    setError(null)

    if (stepNum === 0) {
      if (!understand) return
      setStepNum(1)
      return
    }

    const idx = stepNum - 1 // 0-based question index
    const mode = modes[idx]

    if (mode === 'other') {
      const ans = answers[idx].trim()
      if (ans.length < 2) {
        setError('Ingresá una respuesta válida (al menos 2 caracteres)')
        return
      }
    }

    if (stepNum < 3) {
      setStepNum(stepNum + 1)
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
    if (stepNum > 0) setStepNum(stepNum - 1)
  }

  const setMode = (idx: number, value: AnswerMode) => {
    setModes((prev) => {
      const next: AnswerMode[] = [...prev]
      next[idx] = value
      return next
    })
    setError(null)
  }

  const setAnswer = (idx: number, value: string) => {
    const normalized = normalizeAnswer(value)
    setAnswers((prev) => {
      const next: [string, string, string] = [...prev]
      next[idx] = normalized
      return next
    })
    setError(null)
  }

  const isLast = stepNum === 3
  const continueLabel = stepNum === 0 ? 'Continuar' : isLast ? 'Finalizar' : 'Siguiente'
  const continueDisabled =
    stepNum === 0
      ? !understand
      : modes[stepNum - 1] === 'other' &&
        answers[stepNum - 1].trim().length < 2

  // Build the 4 cards
  const cards = [
    // Card 0: Notice
    {
      key: 'notice',
      content: (
        <>
          <div className="privacy-modal-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
        </>
      ),
    },
    // Card 1: Question 1
    {
      key: 'q1',
      content: (
        <>
          <div className="privacy-modal-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 className="privacy-modal-title">Pregunta 1 de 3</h3>
          <p className="privacy-modal-text">{SECURITY_QUESTIONS[0]}</p>
          <p className="privacy-modal-text-small">
            Si no aplica, elegí &quot;N/A&quot; en el menú.
          </p>
          <div className="login-field">
            <select
              value={modes[0]}
              onChange={(e) => setMode(0, e.target.value as AnswerMode)}
              className="form-input form-select"
            >
              <option value="na">N/A</option>
              <option value="other">Otra respuesta</option>
            </select>
          </div>
          {modes[0] === 'other' && (
            <div className="login-field">
              <input
                ref={stepNum === 1 && modes[0] === 'other' ? inputRef : undefined}
                type="text"
                value={answers[0]}
                onChange={(e) => setAnswer(0, e.target.value)}
                placeholder="Tu respuesta"
                className="form-input"
                autoComplete="off"
                maxLength={60}
              />
            </div>
          )}
        </>
      ),
    },
    // Card 2: Question 2
    {
      key: 'q2',
      content: (
        <>
          <div className="privacy-modal-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 className="privacy-modal-title">Pregunta 2 de 3</h3>
          <p className="privacy-modal-text">{SECURITY_QUESTIONS[1]}</p>
          <p className="privacy-modal-text-small">
            Si no aplica, elegí &quot;N/A&quot; en el menú.
          </p>
          <div className="login-field">
            <select
              value={modes[1]}
              onChange={(e) => setMode(1, e.target.value as AnswerMode)}
              className="form-input form-select"
            >
              <option value="na">N/A</option>
              <option value="other">Otra respuesta</option>
            </select>
          </div>
          {modes[1] === 'other' && (
            <div className="login-field">
              <input
                ref={stepNum === 2 && modes[1] === 'other' ? inputRef : undefined}
                type="text"
                value={answers[1]}
                onChange={(e) => setAnswer(1, e.target.value)}
                placeholder="Tu respuesta"
                className="form-input"
                autoComplete="off"
                maxLength={60}
              />
            </div>
          )}
        </>
      ),
    },
    // Card 3: Question 3
    {
      key: 'q3',
      content: (
        <>
          <div className="privacy-modal-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 className="privacy-modal-title">Pregunta 3 de 3</h3>
          <p className="privacy-modal-text">{SECURITY_QUESTIONS[2]}</p>
          <p className="privacy-modal-text-small">
            Si no aplica, elegí &quot;N/A&quot; en el menú.
          </p>
          <div className="login-field">
            <select
              value={modes[2]}
              onChange={(e) => setMode(2, e.target.value as AnswerMode)}
              className="form-input form-select"
            >
              <option value="na">N/A</option>
              <option value="other">Otra respuesta</option>
            </select>
          </div>
          {modes[2] === 'other' && (
            <div className="login-field">
              <input
                ref={stepNum === 3 && modes[2] === 'other' ? inputRef : undefined}
                type="text"
                value={answers[2]}
                onChange={(e) => setAnswer(2, e.target.value)}
                placeholder="Tu respuesta"
                className="form-input"
                autoComplete="off"
                maxLength={60}
              />
            </div>
          )}
        </>
      ),
    },
  ]

  return createPortal(
    <motion.div
      className="sq-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onCancel}
    >
      <div className="sq-card-stack" onClick={(e) => e.stopPropagation()}>
        {cards.map((card, i) => {
          const position = i - stepNum // 0=active, negative=behind, positive=future
          const isActive = position === 0
          const absPos = Math.abs(position)

          return (
            <motion.div
              key={card.key}
              className={`sq-card ${isActive ? 'sq-card-active' : ''}`}
              animate={{
                opacity: position > 0 ? 0 : isActive ? 1 : absPos === 1 ? 0.5 : absPos === 2 ? 0.3 : 0.15,
                scale: isActive ? 1 : absPos === 1 ? 0.96 : absPos === 2 ? 0.93 : 0.9,
                y: isActive ? 0 : position * 12,
                zIndex: isActive ? 10 : 10 - absPos,
              }}
              transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              style={{ pointerEvents: isActive ? 'auto' : 'none' }}
            >
              {card.content}

              {isActive && (
                <>
                  {error && <p className="sq-error">{error}</p>}
                  <SubmitButton
                    onClick={handleContinue}
                    disabled={continueDisabled}
                  >
                    {continueLabel}
                  </SubmitButton>
                  {stepNum > 0 && <CancelButton onClick={handleBack} />}
                </>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Progress dots */}
      <div className="sq-dots">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`sq-dot ${i <= stepNum ? 'sq-dot-active' : ''}`}
          />
        ))}
      </div>
    </motion.div>,
    document.body
  )
}
