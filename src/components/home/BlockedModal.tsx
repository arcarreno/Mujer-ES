import { motion } from 'motion/react'
import { signOut } from '../../lib/queries'

interface BlockedModalProps {
  until: string
}

export default function BlockedModal({ until }: BlockedModalProps) {
  const untilDate = new Date(until).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function handleLogout() {
    await signOut()
    window.location.reload()
  }

  return (
    <motion.div
      className="modal-overlay blocked-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="blocked-modal"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="blocked-modal-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>

        <h2 className="blocked-modal-title">Cuenta bloqueada</h2>

        <p className="blocked-modal-text">
          Tu cuenta ha sido bloqueada temporalmente por infringir las normas de la comunidad.
        </p>

        <p className="blocked-modal-date">
          Tu bloqueo expira el <strong>{untilDate}</strong>
        </p>

        <p className="blocked-modal-subtext">
          Tiempo suficiente para recapacitar en todo lo que has dicho.
        </p>

        <button
          className="blocked-modal-btn"
          onClick={handleLogout}
          type="button"
        >
          Cerrar sesión
        </button>
      </motion.div>
    </motion.div>
  )
}
