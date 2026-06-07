import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import { viewPassword, getErrorMessage } from '../../lib/queries'
import SubmitButton from '../ui/SubmitButton'

interface ViewPasswordProps {
  resetToken: string
  onClose: () => void
}

export default function ViewPassword({ resetToken, onClose }: ViewPasswordProps) {
  const [password, setPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const pwd = await viewPassword(resetToken)
        if (!cancelled) setPassword(pwd)
      } catch (e) {
        if (!cancelled) {
          sileo.error({
            title: 'No pudimos obtener tu contraseña',
            description: getErrorMessage(e, 'Volvé a verificar tus respuestas'),
          })
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [resetToken, onClose])

  const masked = password ? '•'.repeat(password.length) : ''

  return createPortal(
    <motion.div
      className="privacy-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3 className="privacy-modal-title">Tu contraseña</h3>
        <p className="privacy-modal-text">
          Esta es la contraseña asociada a tu cuenta. No la compartas con nadie.
        </p>
        <div className="password-display">
          {loading ? (
            <span className="password-display-loading">Cargando...</span>
          ) : (
            <span className="password-display-text">
              {revealed ? password : masked}
            </span>
          )}
          {!loading && password && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="password-reveal-btn"
              aria-label={revealed ? 'Ocultar' : 'Mostrar'}
            >
              {revealed ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
        </div>
        <SubmitButton onClick={onClose} type="button">
          Listo
        </SubmitButton>
      </motion.div>
    </motion.div>,
    document.body
  )
}
