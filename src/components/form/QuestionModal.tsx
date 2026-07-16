import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { sileo } from 'sileo'

export interface QuestionConfig {
  id: string
  title: string
  subtitle?: string
  type: 'date' | 'text' | 'select' | 'tel'
  placeholder?: string
  options?: { value: string; label: string }[]
  validate: (value: string) => string | null
}

interface QuestionModalProps {
  question: QuestionConfig
  currentValue: string
  onSave: (value: string) => void
  onSkip?: () => void
  onClose: () => void
  isLast?: boolean
}

export default function QuestionModal({
  question,
  currentValue,
  onSave,
  onSkip,
  onClose,
  isLast,
}: QuestionModalProps) {
  const [value, setValue] = useState(currentValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    setValue(currentValue)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [question.id, currentValue])

  const handleSave = () => {
    const err = question.validate(value)
    if (err) {
      setError(err)
      sileo.error({ title: 'Revisa este campo', description: err })
      return
    }
    onSave(value)
  }

  const isDate = question.type === 'date'
  const isSelect = question.type === 'select'

  return (
    <motion.div
      className="question-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        className="question-modal-card"
        initial={{ y: '100%', opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: '30%', opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="question-modal-close" onClick={onClose} type="button" aria-label="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="question-modal-title">{question.title}</h2>
        {question.subtitle && <p className="question-modal-subtitle">{question.subtitle}</p>}

        <div className="question-modal-input-wrap">
          {isSelect ? (
            <select
              ref={inputRef as React.Ref<HTMLSelectElement>}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              className={`question-modal-input ${error ? 'input-error' : ''}`}
            >
              <option value="" disabled>Selecciona una opción</option>
              {question.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              type={isDate ? 'date' : question.type}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              placeholder={question.placeholder}
              className={`question-modal-input ${error ? 'input-error' : ''}`}
              maxLength={question.type === 'tel' ? 15 : undefined}
              autoFocus
            />
          )}
          {error && <p className="question-modal-error">{error}</p>}
        </div>

        <div className="question-modal-actions">
          {onSkip && !isLast && (
            <button className="question-modal-skip" onClick={onSkip} type="button">
              Saltar
            </button>
          )}
          <button className="question-modal-save" onClick={handleSave} type="button">
            {isLast ? 'Terminar' : 'Guardar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
