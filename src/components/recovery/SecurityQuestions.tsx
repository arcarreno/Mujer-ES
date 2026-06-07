import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import {
  verifySecurityAnswers,
  getErrorMessage,
  type SecurityQuestionsData,
} from '../../lib/queries'
import { normalizeAnswer } from '../../lib/normalize'
import SubmitButton from '../ui/SubmitButton'
import CancelButton from '../ui/CancelButton'

interface SecurityQuestionsProps {
  identifier: string
  questions: SecurityQuestionsData
  onVerified: (resetToken: string) => void
  onBack: () => void
}

export default function SecurityQuestions({
  identifier,
  questions,
  onVerified,
  onBack,
}: SecurityQuestionsProps) {
  const [a1, setA1] = useState('')
  const [a2, setA2] = useState('')
  const [a3, setA3] = useState('')
  const [loading, setLoading] = useState(false)

  const q1Visible = questions.has_answer_1
  const q2Visible = questions.has_answer_2
  const q3Visible = questions.has_answer_3

  const firstInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus the first visible input — ONLY on mount, not on re-render
  // (otherwise typing in input 2 would re-trigger focus on input 1)
  useEffect(() => {
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await verifySecurityAnswers(
        identifier,
        q1Visible ? normalizeAnswer(a1) : '',
        q2Visible ? normalizeAnswer(a2) : '',
        q3Visible ? normalizeAnswer(a3) : '',
      )
      onVerified(result.reset_token)
    } catch (e) {
      sileo.error({
        title: 'Las respuestas no coinciden',
        description: getErrorMessage(
          e,
          'Verificá las respuestas e intentá de nuevo',
        ),
      })
    } finally {
      setLoading(false)
    }
  }

  // Validation: each visible input must have at least 1 non-empty char
  const canSubmit =
    (!q1Visible || a1.trim().length >= 1) &&
    (!q2Visible || a2.trim().length >= 1) &&
    (!q3Visible || a3.trim().length >= 1)

  // Determine which input should auto-focus
  const firstVisible = q1Visible ? 'q1' : q2Visible ? 'q2' : q3Visible ? 'q3' : null

  return createPortal(
    <motion.div
      className="privacy-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={loading ? undefined : onBack}
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
        <h3 className="privacy-modal-title">Preguntas de seguridad</h3>
        <p className="privacy-modal-text">
          Respondé las preguntas para verificar tu identidad.
        </p>

        <form onSubmit={handleSubmit} className="recovery-questions-form">
          {q1Visible && (
            <div className="login-field">
              <label htmlFor="rq-1">{questions.question_1}</label>
              <input
                id="rq-1"
                ref={firstVisible === 'q1' ? firstInputRef : undefined}
                type="text"
                value={a1}
                onChange={(e) => setA1(normalizeAnswer(e.target.value))}
                placeholder="Tu respuesta"
                className="form-input"
                autoComplete="off"
                disabled={loading}
                maxLength={60}
              />
            </div>
          )}
          {q2Visible && (
            <div className="login-field">
              <label htmlFor="rq-2">{questions.question_2}</label>
              <input
                id="rq-2"
                ref={firstVisible === 'q2' ? firstInputRef : undefined}
                type="text"
                value={a2}
                onChange={(e) => setA2(normalizeAnswer(e.target.value))}
                placeholder="Tu respuesta"
                className="form-input"
                autoComplete="off"
                disabled={loading}
                maxLength={60}
              />
            </div>
          )}
          {q3Visible && (
            <div className="login-field">
              <label htmlFor="rq-3">{questions.question_3}</label>
              <input
                id="rq-3"
                ref={firstVisible === 'q3' ? firstInputRef : undefined}
                type="text"
                value={a3}
                onChange={(e) => setA3(normalizeAnswer(e.target.value))}
                placeholder="Tu respuesta"
                className="form-input"
                autoComplete="off"
                disabled={loading}
                maxLength={60}
              />
            </div>
          )}

          <SubmitButton
            type="submit"
            loading={loading}
            disabled={!canSubmit}
          >
            Verificar respuestas
          </SubmitButton>
        </form>

        <CancelButton onClick={onBack} disabled={loading} />
      </motion.div>
    </motion.div>,
    document.body
  )
}
