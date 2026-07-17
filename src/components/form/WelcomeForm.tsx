import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import WelcomeModal from '../welcome/WelcomeModal'
import PrivacyModal from './PrivacyModal'
import { saveOnboardingForm } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

interface WelcomeFormProps {
  userId: string
  username: string
  onComplete: () => void
}

interface Answer {
  id: string
  value: string
  saved: boolean
}

const EDUCATION_OPTIONS = [
  { value: '', label: 'Selecciona una opción' },
  { value: 'sin_estudios', label: 'Sin estudios' },
  { value: 'primaria', label: 'Primaria' },
  { value: 'secundaria', label: 'Secundaria' },
  { value: 'preparatoria', label: 'Preparatoria' },
  { value: 'universidad', label: 'Universidad' },
  { value: 'posgrado', label: 'Posgrado' },
]

interface QuestionDef {
  id: string
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
    title: '¿Cuál es tu nombre completo?',
    type: 'text',
    placeholder: 'Tu nombre completo',
    validate: (v) => {
      if (!v || v.trim().length < 3) return 'Ingresa tu nombre completo'
      return null
    },
  },
  {
    id: 'username',
    title: 'Elige un nombre de usuario',
    subtitle: 'Con este nombre te verán las demás usuarias',
    type: 'text',
    placeholder: 'tu_usuario',
    validate: (v) => {
      if (!v || v.trim().length < 3) return 'Elige un nombre de usuario'
      if (!/^[a-z0-9_]+$/.test(v.trim())) return 'Solo letras minúsculas, números y guión bajo'
      return null
    },
  },
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

export default function WelcomeForm({ userId, username, onComplete }: WelcomeFormProps) {
  const [showWelcome, setShowWelcome] = useState(true)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [saving, setSaving] = useState(false)
  const [direction, setDirection] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false)
      setTimeout(() => setShowPrivacy(true), 500)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const q = QUESTIONS[currentIdx]
  const answer = answers.find((a) => a.id === q.id)
  const value = answer?.value ?? ''
  const isAnswered = answer?.saved ?? false
  // allQuestionsAnswered is available for future use
  void QUESTIONS.every((qq) => answers.some((a) => a.id === qq.id && a.saved))

  const updateValue = (val: string) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.id === q.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { id: q.id, value: val, saved: next[existing].saved }
        return next
      }
      return [...prev, { id: q.id, value: val, saved: false }]
    })
  }

  const markSaved = () => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.id === q.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { ...next[existing], saved: true }
        return next
      }
      return [...prev, { id: q.id, value, saved: true }]
    })
  }

  const saveCurrent = (): boolean => {
    const err = q.validate(value)
    if (err) {
      sileo.error({ title: 'Revisa este campo', description: err })
      return false
    }
    markSaved()
    return true
  }

  const goNext = () => {
    if (!saveCurrent()) return
    if (currentIdx < QUESTIONS.length - 1) {
      setDirection(1)
      setCurrentIdx((i) => i + 1)
    } else {
      handleFinish()
    }
  }

  const goBack = () => {
    if (currentIdx > 0) {
      setDirection(-1)
      setCurrentIdx((i) => i - 1)
    }
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.user) throw new Error('Sesión expirada')

      const responses: Record<string, string> = {}
      for (const qq of QUESTIONS) {
        const a = answers.find((aa) => aa.id === qq.id)
        responses[qq.id] = a?.value ?? ''
      }

      await saveOnboardingForm(userId, responses)
      sileo.success({
        title: '¡Todo listo!',
        description: 'Tu perfil está completo',
      })
      onComplete()
    } catch (e) {
      sileo.error({
        title: 'No pudimos guardar tu perfil',
        description: e instanceof Error ? e.message : 'Revisa tu conexión e intenta de nuevo',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) {
      goNext()
    }
  }

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 400 : -400,
      opacity: 0,
      rotate: dir > 0 ? 6 : -6,
      scale: 0.92,
    }),
    center: {
      x: 0,
      opacity: 1,
      rotate: 0,
      scale: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -400 : 400,
      opacity: 0,
      rotate: dir > 0 ? -6 : 6,
      scale: 0.92,
    }),
  }

  return (
    <>
      <AnimatePresence>
        {showWelcome && <WelcomeModal username={username} />}
      </AnimatePresence>

      <AnimatePresence>
        {showPrivacy && <PrivacyModal onAccept={() => setShowPrivacy(false)} />}
      </AnimatePresence>

      {!showWelcome && !showPrivacy && (
        <div className="onboarding-flow">
          <div className="onboarding-flow-header">
            <h2 className="onboarding-flow-title">Queremos conocerte mejor</h2>
            <p className="onboarding-flow-subtitle">
              Responde las preguntas para que podamos brindarte una mejor experiencia
            </p>
            <div className="onboarding-flow-steps">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`step-dot ${i === currentIdx ? 'active' : ''} ${answers.some((a) => a.id === QUESTIONS[i].id && a.saved) ? 'done' : ''}`}
                  onClick={() => {
                    if (i !== currentIdx) {
                      setDirection(i > currentIdx ? 1 : -1)
                      setCurrentIdx(i)
                    }
                  }}
                />
              ))}
            </div>
          </div>

          <div className="onboarding-flow-card-area">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={q.id}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                className="onboarding-card-tall"
                onKeyDown={handleKeyDown}
              >
                <div className="onboarding-card-badge">
                  {isAnswered ? '✓ Respondida' : `Pregunta ${currentIdx + 1} de ${QUESTIONS.length}`}
                </div>

                <h3 className="onboarding-card-question">{q.title}</h3>
                {q.subtitle && <p className="onboarding-card-subtitle">{q.subtitle}</p>}

                <div className="onboarding-card-field">
                  {q.type === 'select' ? (
                    <select
                      value={value}
                      onChange={(e) => updateValue(e.target.value)}
                      className="onboarding-input"
                      disabled={saving}
                    >
                      <option value="" disabled>Selecciona una opción</option>
                      {q.options?.slice(1).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={q.type === 'date' ? 'date' : q.type}
                      value={value}
                      onChange={(e) => updateValue(e.target.value)}
                      placeholder={q.placeholder}
                      className="onboarding-input"
                      maxLength={q.type === 'tel' ? 15 : undefined}
                      disabled={saving}
                      autoFocus
                    />
                  )}
                </div>

                {isAnswered && (
                  <p className="onboarding-card-ok">Listo ✓</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="onboarding-flow-nav">
            <button
              className="onboarding-nav-btn secondary"
              onClick={goBack}
              disabled={currentIdx === 0 || saving}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Anterior
            </button>

            <button
              className="onboarding-nav-btn primary"
              onClick={goNext}
              disabled={saving}
            >
              {saving
                ? 'Guardando...'
                : currentIdx === QUESTIONS.length - 1
                  ? 'Finalizar'
                  : 'Siguiente'}
              {!saving && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
