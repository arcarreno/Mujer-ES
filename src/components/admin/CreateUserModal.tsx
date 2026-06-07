import { useState } from 'react'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import { adminCreateUser } from '../../lib/admin'
import { getErrorMessage } from '../../lib/queries'

interface CreateUserModalProps {
  onClose: () => void
  onCreated: () => void
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pwd = ''
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

export default function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState(generatePassword())
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminCreateUser({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        username: username.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        is_admin: isAdmin,
      })
      sileo.success({
        title: isAdmin ? 'Administrador creado' : 'Usuario creado',
        description: `Contraseña temporal: ${password}. Compartila con la persona por un canal seguro.`,
      })
      onCreated()
      onClose()
    } catch (err) {
      sileo.error({
        title: 'No pudimos crear la cuenta',
        description: getErrorMessage(err, 'Revisá que el usuario y el correo no estén en uso'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="privacy-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="create-user-modal"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="user-detail-close" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>

        <h2 className="login-title" style={{ marginBottom: '0.5rem' }}>
          {isAdmin ? 'Crear administrador' : 'Crear usuario'}
        </h2>
        <p className="otp-subtitle" style={{ marginBottom: '1.5rem' }}>
          Se generará una contraseña temporal que podrás compartir
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="cu-email">Correo</label>
            <input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@correo.com" required />
          </div>
          <div className="login-field">
            <label htmlFor="cu-name">Nombre completo</label>
            <input id="cu-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre" required />
          </div>
          <div className="login-field">
            <label htmlFor="cu-user">Usuario</label>
            <input id="cu-user" type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="usuario_unico" required />
          </div>
          <div className="login-field">
            <label htmlFor="cu-phone">Teléfono (opcional)</label>
            <input id="cu-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 dígitos" />
          </div>
          <div className="login-field">
            <label htmlFor="cu-pwd">Contraseña temporal</label>
            <input id="cu-pwd" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button
            type="button"
            onClick={() => setIsAdmin(!isAdmin)}
            className="cu-type-toggle"
            aria-pressed={isAdmin}
          >
            <span className={`cu-type-pill ${!isAdmin ? 'active' : ''}`}>Usuario</span>
            <span className={`cu-type-pill ${isAdmin ? 'active' : ''}`}>Administrador</span>
          </button>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Creando...' : isAdmin ? 'Crear administrador' : 'Crear usuario'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
