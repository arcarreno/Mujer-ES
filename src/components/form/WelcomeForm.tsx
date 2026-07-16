import { useState, useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import WelcomeModal from '../welcome/WelcomeModal'
import OnboardingGallery from './OnboardingGallery'
import QuestionModal, { type QuestionConfig } from './QuestionModal'
import PrivacyModal from './PrivacyModal'
import { saveOnboardingForm } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

interface WelcomeFormProps {
  userId: string
  username: string
  onComplete: () => void
}

interface OnboardingAnswer {
  id: string
  value: string
}

const EDUCATION_OPTIONS = [
  { value: 'sin_estudios', label: 'Sin estudios' },
  { value: 'primaria', label: 'Primaria' },
  { value: 'secundaria', label: 'Secundaria' },
  { value: 'preparatoria', label: 'Preparatoria' },
  { value: 'universidad', label: 'Universidad' },
  { value: 'posgrado', label: 'Posgrado' },
]

const QUESTIONS: QuestionConfig[] = [
  {
    id: 'full_name',
    title: '¿Cuál es tu nombre completo?',
    type: 'text',
    placeholder: 'Tu nombre completo',
    validate: (v: string) => {
      if (!v || v.trim().length < 3) return 'Ingresá tu nombre completo'
      return null
    },
  },
  {
    id: 'username',
    title: 'Elegí un nombre de usuario',
    subtitle: 'Con este nombre te van a ver las demás usuarias',
    type: 'text',
    placeholder: 'tu_usuario',
    validate: (v: string) => {
      if (!v || v.trim().length < 3) return 'Elegí un nombre de usuario'
      if (!/^[a-z0-9_]+$/.test(v.trim())) return 'Solo letras minúsculas, números y guión bajo'
      return null
    },
  },
  {
    id: 'birthdate',
    title: '¿Cuál es tu fecha de nacimiento?',
    type: 'date',
    validate: (v: string) => {
      if (!v) return 'Seleccioná tu fecha de nacimiento'
      const birth = new Date(v)
      const now = new Date()
      const age = now.getFullYear() - birth.getFullYear()
      if (age < 13) return 'Debés tener al menos 13 años'
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
    validate: (v: string) => {
      if (!v || v.trim().length < 2) return 'Contanos a qué te dedicás'
      return null
    },
  },
  {
    id: 'location',
    title: '¿En dónde vivís?',
    subtitle: 'Ciudad o estado',
    type: 'text',
    placeholder: 'Tu ubicación',
    validate: (v: string) => {
      if (!v || v.trim().length < 2) return 'Indicanos tu ubicación'
      return null
    },
  },
  {
    id: 'education',
    title: '¿Cuál es tu grado de estudios?',
    type: 'select',
    options: EDUCATION_OPTIONS,
    validate: (v: string) => {
      if (!v) return 'Seleccioná una opción'
      return null
    },
  },
  {
    id: 'phone',
    title: '¿Cuál es tu número de teléfono?',
    subtitle: 'Para que el equipo pueda contactarte si es necesario',
    type: 'tel',
    placeholder: '10 dígitos',
    validate: (v: string) => {
      const digits = v.replace(/\D/g, '')
      if (digits.length < 10) return 'Ingresá un número de 10 dígitos'
      return null
    },
  },
]

export default function WelcomeForm({ userId, username, onComplete }: WelcomeFormProps) {
  const [showWelcome, setShowWelcome] = useState(true)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [answers, setAnswers] = useState<OnboardingAnswer[]>([])
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false)
      setTimeout(() => setShowPrivacy(true), 500)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const getAnswer = (id: string): string => {
    return answers.find((a) => a.id === id)?.value ?? ''
  }

  const handleCardSelect = (index: number) => {
    setSelectedCard(index)
  }

  const handleSaveAnswer = (value: string) => {
    if (selectedCard === null) return
    const q = QUESTIONS[selectedCard]
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.id === q.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { id: q.id, value }
        return next
      }
      return [...prev, { id: q.id, value }]
    })
    setSelectedCard(null)
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.user) throw new Error('Sesión expirada')

      const responses: Record<string, string> = {}
      for (const q of QUESTIONS) {
        const answer = answers.find((a) => a.id === q.id)?.value ?? ''
        responses[q.id] = answer
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
        description: e instanceof Error ? e.message : 'Revisá tu conexión e intentá de nuevo',
      })
    } finally {
      setSaving(false)
    }
  }

  const galleryCards = QUESTIONS.map((q) => {
    const answer = answers.find((a) => a.id === q.id)
    return {
      id: q.id,
      title: q.title,
      subtitle: answer ? `✓ ${answer.value}` : q.subtitle,
      completed: !!answer,
    }
  })

  const allAnswered = QUESTIONS.every((q) => answers.some((a) => a.id === q.id))

  return (
    <>
      <AnimatePresence>
        {showWelcome && (
          <WelcomeModal username={username} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPrivacy && (
          <PrivacyModal
            onAccept={() => setShowPrivacy(false)}
          />
        )}
      </AnimatePresence>

      {!showWelcome && !showPrivacy && (
        <div className="onboarding-container">
          <div className="onboarding-header">
            <h2 className="onboarding-title">Contanos sobre vos</h2>
            <p className="onboarding-subtitle">
              Tocá una pregunta para responderla. Respondé las que quieras.
            </p>
            <div className="onboarding-progress">
              {answers.length} de {QUESTIONS.length} respondidas
            </div>
          </div>

          <div className="onboarding-gallery-wrap">
            <OnboardingGallery
              cards={galleryCards}
              onCardSelect={handleCardSelect}
            />
          </div>

          <div className="onboarding-footer">
            <button
              className="onboarding-finish"
              onClick={handleFinish}
              disabled={saving}
            >
              {saving ? 'Guardando...' : allAnswered ? 'Ir a la plataforma' : 'Después, ir a la plataforma'}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedCard !== null && (
          <QuestionModal
            question={QUESTIONS[selectedCard]}
            currentValue={getAnswer(QUESTIONS[selectedCard].id)}
            onSave={handleSaveAnswer}
            onClose={() => setSelectedCard(null)}
            onSkip={() => setSelectedCard(null)}
            isLast={selectedCard === QUESTIONS.length - 1}
          />
        )}
      </AnimatePresence>
    </>
  )
}
