import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { setInitialPassword } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import SuccessAnimation from '../ui/SuccessAnimation'

interface SetPasswordFormProps {
  userId: string
  onComplete: () => void
}

export default function SetPasswordForm({ userId, onComplete }: SetPasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      sileo.error({ title: 'La contraseña debe tener al menos 6 caracteres' })
      return
    }
    if (password !== confirm) {
      sileo.error({ title: 'Las contraseñas no coinciden' })
      return
    }

    setSaving(true)
    try {
      const { error: authError } = await supabase.auth.updateUser({ password })
      if (authError) throw authError

      try {
        await setInitialPassword(userId, password)
      } catch (rpcError) {
        console.warn('RPC set_initial_password failed, trying direct update:', rpcError)
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ first_login: false })
        .eq('id', userId)
      if (profileError) {
        const { error: adminError } = await supabase
          .from('admins')
          .update({ first_login: false })
          .eq('id', userId)
        if (adminError) {
          console.warn('Direct first_login update failed on both tables:', profileError, adminError)
        }
      }

      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        onComplete()
      }, 2000)
    } catch (error) {
      sileo.error({
        title: 'No se pudo establecer la contraseña',
        description: error instanceof Error ? error.message : 'Intenta de nuevo',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {showSuccess && <SuccessAnimation />}
      </AnimatePresence>

      <div className="set-password-overlay">
        <div className="set-password-card">
          <h1 className="set-password-title">Establece tu contraseña</h1>
          <p className="set-password-subtitle">
            Esta es la primera vez que inicias sesión. Crea una contraseña segura para tu cuenta.
          </p>

          <form onSubmit={handleSubmit} className="set-password-form">
            <div className="set-password-field">
              <label htmlFor="new-password">Nueva contraseña</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={saving}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="set-password-field">
              <label htmlFor="confirm-password">Confirma tu contraseña</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                disabled={saving}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="set-password-btn" disabled={saving}>
              {saving ? 'Guardando...' : 'Crear contraseña'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
