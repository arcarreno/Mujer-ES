import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import { modifyPassword, validatePassword, getErrorMessage } from '../../lib/queries'
import SubmitButton from '../ui/SubmitButton'
import CancelButton from '../ui/CancelButton'

interface ModifyPasswordProps {
  resetToken: string
  onComplete: () => void
  onClose: () => void
}

export default function ModifyPassword({ resetToken, onComplete, onClose }: ModifyPasswordProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (password !== confirm) {
      sileo.error({
        title: 'Las contraseñas no coinciden',
        description: 'Verificá que sean exactamente iguales',
      })
      return
    }

    const pwdError = validatePassword(password)
    if (pwdError) {
      sileo.error({ title: 'Revisá la contraseña', description: pwdError })
      return
    }

    setLoading(true)
    try {
      await modifyPassword(resetToken, password)
      sileo.success({
        title: '¡Contraseña actualizada!',
        description: 'Ya podés iniciar sesión con tu nueva contraseña',
      })
      onComplete()
    } catch (e) {
      sileo.error({
        title: 'No pudimos actualizar tu contraseña',
        description: getErrorMessage(e, 'Volvé a verificar tus respuestas e intentá de nuevo'),
      })
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <motion.div
      className="privacy-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={loading ? undefined : onClose}
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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <h3 className="privacy-modal-title">Nueva contraseña</h3>
        <p className="privacy-modal-text">
          Creá una contraseña nueva. Al menos 6 caracteres, una mayúscula y un número.
        </p>
        <form onSubmit={handleSubmit} className="forgot-form">
          <div className="login-field">
            <label htmlFor="modify-pwd">Nueva contraseña</label>
            <input
              id="modify-pwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="login-field">
            <label htmlFor="modify-pwd-confirm">Confirmar contraseña</label>
            <input
              id="modify-pwd-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repetí la contraseña"
              autoComplete="new-password"
            />
          </div>
          <SubmitButton type="submit" loading={loading}>
            Cambiar contraseña
          </SubmitButton>
        </form>
        <CancelButton onClick={onClose} disabled={loading}>
          Cancelar
        </CancelButton>
      </motion.div>
    </motion.div>,
    document.body
  )
}
