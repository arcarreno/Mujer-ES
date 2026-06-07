import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { getErrorMessage } from '../../lib/queries'

export interface InitialFormData {
  birthdate: string
  occupation: string
  location: string
  education: string
  phone: string
}

interface CardSwapFormProps {
  onComplete: (data: InitialFormData) => Promise<void>
}

type FormKey = keyof InitialFormData

interface Question {
  id: FormKey
  title: string
  subtitle?: string
  type: 'date' | 'text' | 'select' | 'tel'
  placeholder?: string
  options?: { value: string; label: string }[]
  validate: (value: string) => string | null
}

const EDUCATION_OPTIONS = [
  { value: 'sin_estudios', label: 'Sin estudios' },
  { value: 'primaria', label: 'Primaria' },
  { value: 'secundaria', label: 'Secundaria' },
  { value: 'preparatoria', label: 'Preparatoria' },
  { value: 'universidad', label: 'Universidad' },
  { value: 'posgrado', label: 'Posgrado' },
]

const questions: Question[] = [
  {
    id: 'birthdate',
    title: '¿Cuál es tu fecha de nacimiento?',
    type: 'date',
    validate: (v) => {
      if (!v) return 'Selecciona tu fecha de nacimiento'
      const birth = new Date(v)
      const now = new Date()
      const age = now.getFullYear() - birth.getFullYear()
      if (age < 13) return 'Debes tener al menos 13 años'
      if (age > 120) return 'Fecha inválida'
      return null
    },
  },
  {
    id: 'occupation',
    title: '¿A qué te dedicas?',
    subtitle: 'Estudiante, profesionista, ama de casa, etc.',
    type: 'text',
    placeholder: 'Tu ocupación',
    validate: (v) => {
      if (!v || v.trim().length < 2) return 'Cuéntanos a qué te dedicas'
      return null
    },
  },
  {
    id: 'location',
    title: '¿En dónde vives?',
    subtitle: 'Ciudad o estado',
    type: 'text',
    placeholder: 'Tu ubicación',
    validate: (v) => {
      if (!v || v.trim().length < 2) return 'Indícanos tu ubicación'
      return null
    },
  },
  {
    id: 'education',
    title: '¿Cuál es tu grado de estudios?',
    type: 'select',
    options: EDUCATION_OPTIONS,
    validate: (v) => {
      if (!v) return 'Selecciona una opción'
      return null
    },
  },
  {
    id: 'phone',
    title: '¿Cuál es tu número de teléfono?',
    subtitle: 'Para que el equipo pueda contactarte si es necesario',
    type: 'tel',
    placeholder: '10 dígitos',
    validate: (v) => {
      const digits = v.replace(/\D/g, '')
      if (digits.length < 10) return 'Ingresa un número de 10 dígitos'
      return null
    },
  },
]

export default function CardSwapForm({ onComplete }: CardSwapFormProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [formData, setFormData] = useState<InitialFormData>({
    birthdate: '',
    occupation: '',
    location: '',
    education: '',
    phone: '',
  })
  const [loading, setLoading] = useState(false)

  const currentQ = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const value = formData[currentQ.id]

  const setValue = (val: string) => {
    setFormData((prev) => ({ ...prev, [currentQ.id]: val }))
  }

  const handleNext = () => {
    const err = currentQ.validate(value)
    if (err) {
      sileo.error({ title: 'Revisa este campo', description: err })
      return
    }
    if (isLast) {
      handleSubmit()
      return
    }
    setCurrentIndex((i) => i + 1)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onComplete(formData)
    } catch (e) {
      sileo.error({
        title: 'No pudimos guardar tu perfil',
        description: getErrorMessage(e, 'Revisá tu conexión e intentá de nuevo'),
      })
      setLoading(false)
    }
  }

  const renderInput = () => {
    const commonProps = {
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValue(e.target.value),
      disabled: loading,
      autoFocus: true,
    }

    if (currentQ.type === 'select') {
      return (
        <select {...commonProps} className="form-input form-select">
          <option value="" disabled>Selecciona una opción</option>
          {currentQ.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    }

    return (
      <input
        {...commonProps}
        type={currentQ.type}
        placeholder={currentQ.placeholder}
        className="form-input"
        maxLength={currentQ.type === 'tel' ? 15 : undefined}
      />
    )
  }

  return (
    <div className="cardswap-container">
      {currentIndex < questions.length - 1 && (
        <div
          className="card-stack-behind"
          style={{ transform: 'translate(24px, -24px) scale(0.94)', opacity: 0.4 }}
          aria-hidden
        />
      )}
      {currentIndex < questions.length - 2 && (
        <div
          className="card-stack-behind"
          style={{ transform: 'translate(48px, -48px) scale(0.88)', opacity: 0.2 }}
          aria-hidden
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          className="form-card"
          initial={{ x: 320, y: -180, opacity: 0, scale: 0.7, rotate: -8 }}
          animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          exit={{ y: 700, opacity: 0, scale: 0.85, rotate: 4 }}
          transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="form-card-header">
            <span className="form-card-step">Pregunta {currentIndex + 1} de {questions.length}</span>
            <div className="form-card-progress">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`form-progress-dot${i <= currentIndex ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <h2 className="form-card-question">{currentQ.title}</h2>
          {currentQ.subtitle && <p className="form-card-subtitle">{currentQ.subtitle}</p>}

          <div className="form-card-input-wrap">
            {renderInput()}
          </div>

          <button
            onClick={handleNext}
            disabled={loading}
            className="form-card-submit"
            type="button"
          >
            {loading
              ? 'Guardando...'
              : isLast
                ? 'Terminar formulario'
                : 'Siguiente'}
            {!loading && !isLast && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            )}
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
