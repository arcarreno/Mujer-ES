import { useState, useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import WelcomeModal from '../welcome/WelcomeModal'
import CardSwapForm, { type InitialFormData } from './CardSwapForm'
import { saveInitialForm } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

interface WelcomeFormProps {
  userId: string
  username: string
  onComplete: () => void
}

export default function WelcomeForm({ userId, username, onComplete }: WelcomeFormProps) {
  const [showWelcome, setShowWelcome] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleFormComplete = async (data: InitialFormData) => {
    const { data: session } = await supabase.auth.getSession()
    if (!session.session?.user) throw new Error('Sesión expirada')

    await saveInitialForm(userId, data)
    sileo.success({
      title: '¡Listo!',
      description: 'Tu perfil está completo',
    })
    onComplete()
  }

  return (
    <>
      <AnimatePresence>
        {showWelcome && (
          <WelcomeModal username={username} />
        )}
      </AnimatePresence>

      {!showWelcome && (
        <CardSwapForm onComplete={handleFormComplete} />
      )}
    </>
  )
}
