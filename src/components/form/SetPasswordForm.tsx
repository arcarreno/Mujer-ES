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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const handleSuccessDone = () => {
    setShowSuccess(false)
    onComplete()
  }

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
        {showSuccess && <SuccessAnimation message="¡Contraseña creada!" onDone={handleSuccessDone} />}
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
              <div className="set-password-input-wrap">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  disabled={saving}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="set-password-eye"
                  onClick={() => setShowPassword((p) => !p)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="set-password-field">
              <label htmlFor="confirm-password">Confirma tu contraseña</label>
              <div className="set-password-input-wrap">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  disabled={saving}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="set-password-eye"
                  onClick={() => setShowConfirm((p) => !p)}
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showConfirm ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
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
