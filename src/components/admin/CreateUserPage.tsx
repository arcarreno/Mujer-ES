import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { adminCreateUser } from '../../lib/admin'
import { getErrorMessage } from '../../lib/queries'
import SuccessAnimation from '../ui/SuccessAnimation'

interface CreateUserPageProps {
  onCreated: () => void
  onBack: () => void
}

export default function CreateUserPage({ onCreated, onBack }: CreateUserPageProps) {
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      sileo.error({ title: 'Correo requerido', description: 'El correo electrónico es obligatorio' })
      return
    }
      setLoading(true)
    try {
      const result = await adminCreateUser({
        email: email.trim(),
        is_admin: isAdmin,
      })
      if (result.email_sent === 'error') {
        sileo.warning({
          title: 'Cuenta creada, pero no se pudo enviar el email',
          description: 'La usuaria deberá iniciar con su correo como contraseña inicial.',
        })
      } else if (result.email_sent === 'ok') {
        sileo.success({
          title: 'Correo enviado',
          description: 'La usuaria recibió sus credenciales por correo.',
        })
      }
      setShowSuccess(true)
    } catch (err) {
      sileo.error({
        title: 'No pudimos crear la cuenta',
        description: getErrorMessage(err, 'Revisá que el correo no esté en uso'),
      })
      setLoading(false)
    }
  }

  const handleSuccessDone = () => {
    setShowSuccess(false)
    onCreated()
  }

  return (
    <>
      <AnimatePresence>
        {showSuccess && <SuccessAnimation message="¡Cuenta creada!" onDone={handleSuccessDone} />}
      </AnimatePresence>

      <motion.div
        className="create-user-page"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <button onClick={onBack} className="volver-btn-sm volver-btn-sm-no-expand" type="button">
          <div className="volver-btn-sm-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
            </svg>
          </div>
          <p className="volver-btn-sm-text">Volver</p>
        </button>

        <h2 className="login-title">
          {isAdmin ? 'Crear administrador' : 'Crear usuaria'}
        </h2>
        <p className="otp-subtitle">
          Ingresá solo el correo electrónico. La contraseña inicial será el mismo correo.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="cu-email">Correo electrónico</label>
            <input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@correo.com" required />
          </div>

          <button
            type="button"
            onClick={() => setIsAdmin(!isAdmin)}
            className="cu-type-toggle"
            aria-pressed={isAdmin}
          >
            <span className={`cu-type-pill ${!isAdmin ? 'active' : ''}`}>Usuaria</span>
            <span className={`cu-type-pill ${isAdmin ? 'active' : ''}`}>Administrador</span>
          </button>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Creando...' : isAdmin ? 'Crear administrador' : 'Crear usuaria'}
          </button>
        </form>
      </motion.div>
    </>
  )
}
