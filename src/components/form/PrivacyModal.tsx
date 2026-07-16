import { motion } from 'motion/react'

interface PrivacyModalProps {
  onAccept: () => void
}

export default function PrivacyModal({ onAccept }: PrivacyModalProps) {
  return (
    <motion.div
      className="privacy-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="privacy-modal-card"
        initial={{ scale: 0.85, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, y: 40, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="privacy-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#581C87" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2 className="privacy-modal-title">Privacidad y confidencialidad</h2>

        <div className="privacy-modal-body">
          <p>
            Tu información personal está protegida. Todos los datos que compartas en
            esta plataforma serán tratados con total confidencialidad y no serán
            compartidos con terceros sin tu consentimiento.
          </p>
          <p>
            La información que proporciones será utilizada únicamente para mejorar
            tu experiencia dentro de la plataforma y brindarte el mejor apoyo posible.
          </p>
          <p>
            Puedes estar tranquila: tus datos están seguros con nosotras.
          </p>
        </div>

        <button className="privacy-modal-accept" onClick={onAccept} type="button">
          Entendido, continuar
        </button>
      </motion.div>
    </motion.div>
  )
}
