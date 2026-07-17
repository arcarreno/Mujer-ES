import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import WelcomeModal from '../welcome/WelcomeModal'
import PrivacyModal from './PrivacyModal'
import SuccessAnimation from '../ui/SuccessAnimation'
import { saveOnboardingForm } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

import cardImg1 from '../../assets/imagenes-cards/woman8.jpeg'
import cardImg2 from '../../assets/imagenes-cards/woman9.jpeg'
import cardImg3 from '../../assets/imagenes-cards/woman10.jpeg'
import cardImg4 from '../../assets/imagenes-cards/woman11.jpeg'
import cardImg5 from '../../assets/imagenes-cards/woman5.webp'
import cardImg6 from '../../assets/imagenes-cards/woman6.webp'
import cardImg7 from '../../assets/imagenes-cards/woman7.jpg'

const CARD_IMAGES = [cardImg1, cardImg2, cardImg3, cardImg4, cardImg5, cardImg6, cardImg7]

interface WelcomeFormProps {
  userId: string
  username: string
  onComplete: () => void
}

const EDUCATION_OPTIONS = [
  { value: 'sin_estudios', label: 'Sin estudios' },
  { value: 'primaria', label: 'Primaria' },
  { value: 'secundaria', label: 'Secundaria' },
  { value: 'preparatoria', label: 'Preparatoria' },
  { value: 'universidad', label: 'Universidad' },
  { value: 'posgrado', label: 'Posgrado' },
]

interface QuestionDef {
  id: string
  short: string
  title: string
  subtitle?: string
  type: 'date' | 'text' | 'select' | 'tel'
  placeholder?: string
  options?: { value: string; label: string }[]
  validate: (v: string) => string | null
}

const QUESTIONS: QuestionDef[] = [
  {
    id: 'full_name',
    short: 'Nombre',
    title: '¿Cuál es tu nombre?',
    type: 'text',
    placeholder: 'Tu nombre completo',
    validate: (v) => {
      if (!v || v.trim().length < 3) return 'Ingresa tu nombre completo'
      return null
    },
  },
  {
    id: 'username',
    short: 'Usuario',
    title: 'Elige un nombre de usuario',
    subtitle: 'Con este nombre te verán las demás',
    type: 'text',
    placeholder: 'tu_usuario',
    validate: (v) => {
      if (!v || v.trim().length < 3) return 'Elige un nombre de usuario'
      if (!/^[a-z0-9_]+$/.test(v.trim())) return 'Solo minúsculas, números y guión bajo'
      return null
    },
  },
  {
    id: 'birthdate',
    short: 'Cumple',
    title: '¿Tu fecha de nacimiento?',
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
    short: 'Ocupación',
    title: '¿A qué te dedicas?',
    subtitle: 'Estudiante, profesionista, ama de casa…',
    type: 'text',
    placeholder: 'Tu ocupación',
    validate: (v) => {
      if (!v || v.trim().length < 2) return 'Cuéntanos a qué te dedicas'
      return null
    },
  },
  {
    id: 'location',
    short: 'Ubicación',
    title: '¿Dónde vives?',
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
    short: 'Estudios',
    title: '¿Tu grado de estudios?',
    type: 'select',
    options: EDUCATION_OPTIONS,
    validate: (v) => {
      if (!v) return 'Selecciona una opción'
      return null
    },
  },
  {
    id: 'phone',
    short: 'Teléfono',
    title: '¿Tu número de teléfono?',
    subtitle: 'Para contactarte si es necesario',
    type: 'tel',
    placeholder: '10 dígitos',
    validate: (v) => {
      const digits = v.replace(/\D/g, '')
      if (digits.length < 10) return 'Ingresa un número de 10 dígitos'
      return null
    },
  },
]

export default function WelcomeForm({ userId, username, onComplete }: WelcomeFormProps) {
  const [showWelcome, setShowWelcome] = useState(true)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false)
      setTimeout(() => setShowPrivacy(true), 500)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const toggleCard = (idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx))
  }

  const updateValue = (id: string, val: string) => {
    setValues((prev) => ({ ...prev, [id]: val }))
  }

  const isFieldValid = (q: QuestionDef): boolean => {
    const val = values[q.id]?.trim() ?? ''
    if (!val) return false
    return q.validate(val) === null
  }

  const allValid = QUESTIONS.every(isFieldValid)
  const validCount = QUESTIONS.filter(isFieldValid).length

  const handleFinish = async () => {
    if (!allValid) return
    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.user) throw new Error('Sesión expirada')

      const responses: Record<string, string> = {}
      for (const q of QUESTIONS) {
        responses[q.id] = values[q.id] ?? ''
      }

      await saveOnboardingForm(userId, responses)
      setSaving(false)
      setShowSuccess(true)
    } catch (e) {
      sileo.error({
        title: 'No pudimos guardar tu perfil',
        description: e instanceof Error ? e.message : 'Revisa tu conexión e intenta de nuevo',
      })
      setSaving(false)
    }
  }

  const handleSuccessDone = () => {
    setShowSuccess(false)
    onComplete()
  }

  const getFieldError = (q: QuestionDef): string | null => {
    const val = values[q.id]?.trim() ?? ''
    if (!val) return null
    return q.validate(val)
  }

  return (
    <>
      <AnimatePresence>
        {showSuccess && <SuccessAnimation message="¡Bienvenida!" onDone={handleSuccessDone} />}
      </AnimatePresence>

      <AnimatePresence>
        {showWelcome && <WelcomeModal username={username} />}
      </AnimatePresence>

      <AnimatePresence>
        {showPrivacy && <PrivacyModal onAccept={() => setShowPrivacy(false)} />}
      </AnimatePresence>

      {!showWelcome && !showPrivacy && (
        <div className="onboarding-haccordion">
          <div className="onboarding-haccordion-header">
            <h2 className="onboarding-haccordion-title">Queremos conocerte</h2>
            <p className="onboarding-haccordion-sub">
              Tocá cada ficha para expandirla y completá los datos.
            </p>
            <div className="onboarding-haccordion-progress">
              <div className="haccordion-progress-track">
                <div
                  className="haccordion-progress-fill"
                  style={{ width: `${(validCount / QUESTIONS.length) * 100}%` }}
                />
              </div>
              <span className="haccordion-progress-text">
                {validCount} de {QUESTIONS.length}
              </span>
            </div>
          </div>

          <div className="onboarding-haccordion-scroll" ref={scrollRef}>
            <div className="onboarding-haccordion-track">
              {QUESTIONS.map((q, idx) => {
                const isOpen = expandedIdx === idx
                const val = values[q.id] ?? ''
                const fieldValid = isFieldValid(q)
                const error = getFieldError(q)

                return (
                  <motion.div
                    key={q.id}
                    layout
                    className={`haccordion-card ${isOpen ? 'open' : ''} ${fieldValid ? 'saved' : ''}`}
                    style={{ backgroundImage: `url(${CARD_IMAGES[idx]})` }}
                    onClick={() => {
                      if (!isOpen) toggleCard(idx)
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    <div className="haccordion-card-overlay" />
                    <div className="haccordion-card-inner">
                      <div className="haccordion-card-header">
                        <span className={`haccordion-card-badge ${fieldValid ? 'done' : ''}`}>
                          {fieldValid ? '✓' : `${idx + 1}`}
                        </span>
                        <span className="haccordion-card-short">{q.short}</span>
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key="content"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 16 }}
                            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                            className="haccordion-card-content"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <h3 className="haccordion-content-title">{q.title}</h3>
                            {q.subtitle && (
                              <p className="haccordion-content-sub">{q.subtitle}</p>
                            )}

                            {q.type === 'select' ? (
                              <select
                                value={val}
                                onChange={(e) => updateValue(q.id, e.target.value)}
                                className="haccordion-input"
                                disabled={saving}
                                autoFocus
                              >
                                <option value="" disabled>Selecciona</option>
                                {q.options?.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={q.type === 'date' ? 'date' : q.type}
                                value={val}
                                onChange={(e) => updateValue(q.id, e.target.value)}
                                placeholder={q.placeholder}
                                className={`haccordion-input ${error ? 'input-error' : ''}`}
                                maxLength={q.type === 'tel' ? 15 : undefined}
                                disabled={saving}
                                autoFocus
                              />
                            )}

                            {error && (
                              <p className="haccordion-error-msg">{error}</p>
                            )}

                            <div className="haccordion-content-footer">
                              {fieldValid && (
                                <span className="haccordion-saved-label">✓ Completo</span>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          <div className="onboarding-haccordion-footer">
            <button
              className="onboarding-haccordion-finish"
              onClick={handleFinish}
              disabled={saving || !allValid}
            >
              {saving ? 'Guardando...' : 'Iniciar la experiencia'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
