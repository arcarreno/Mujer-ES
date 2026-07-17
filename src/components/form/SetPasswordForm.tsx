import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { supabase } from '../../lib/supabase'
import SuccessAnimation from '../ui/SuccessAnimation'

interface SetPasswordFormProps {
  userId: string
  onComplete: () => void
}

export default function SetPasswordForm({ userId, onComplete }: SetPasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no son iguales')
      return
    }

    setLoading(true)
    try {
      const { error: rpcErr } = await supabase.rpc('set_initial_password', {
        p_user_id: userId,
        p_new_password: password,
      })
      if (rpcErr) throw rpcErr

      setShowSuccess(true)
    } catch (err) {
      sileo.error({
        title: 'No pudimos guardar la contraseña',
        description: err instanceof Error ? err.message : 'Intentá de nuevo',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <motion.div
        className="set-password-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="set-password-card"
          initial={{ scale: 0.85, y: 40, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.85, y: 40, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        >
          <h2 className="set-password-title">Establecé tu contraseña</h2>
          <p className="set-password-subtitle">
            Por ser tu primera vez, necesitás crear una contraseña personalizada.
            La que usaste para iniciar sesión fue temporal.
          </p>

          <form onSubmit={handleSubmit} className="set-password-form">
            <div className="login-field">
              <label htmlFor="sp-password">Nueva contraseña</label>
              <input
                id="sp-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
                autoFocus
                disabled={showSuccess}
              />
            </div>
            <div className="login-field">
              <label htmlFor="sp-confirm">Confirmar contraseña</label>
              <input
                id="sp-confirm"
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null) }}
                placeholder="Repetí la contraseña"
                minLength={6}
                required
                disabled={showSuccess}
              />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button
              type="submit"
              className="login-submit"
              disabled={loading || showSuccess}
            >
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showSuccess && (
          <SuccessAnimation
            message="Contraseña guardada correctamente"
            onDone={onComplete}
          />
        )}
      </AnimatePresence>
    </>
  )
}
