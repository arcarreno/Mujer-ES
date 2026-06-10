import { useState } from 'react'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import { adminCreateUser } from '../../lib/admin'
import { getErrorMessage } from '../../lib/queries'

interface CreateUserPageProps {
  onCreated: () => void
  onBack: () => void
}

export default function CreateUserPage({ onCreated, onBack }: CreateUserPageProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
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
        description: 'Ya puede iniciar sesión con su correo y contraseña.',
      })
      onCreated()
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
      className="create-user-page"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <button onClick={onBack} className="volver-btn-sm" type="button">
        <div className="volver-btn-sm-bg">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
            <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
            <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
          </svg>
        </div>
        <p className="volver-btn-sm-text">Volver</p>
      </button>

      <h2 className="login-title">
        {isAdmin ? 'Crear administrador' : 'Crear usuario'}
      </h2>
      <p className="otp-subtitle">
        Ingresá la contraseña que se usará para iniciar sesión
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
          <label htmlFor="cu-pwd">Contraseña</label>
          <input id="cu-pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />
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
  )
}
