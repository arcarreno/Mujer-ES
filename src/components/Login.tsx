import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Register from './Register'

interface LoginProps {
  onBack?: () => void
}

export default function Login({ onBack }: LoginProps) {
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [showRegister, setShowRegister] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <div className="login-container" style={{ perspective: '1000px' }}>
      <AnimatePresence mode="wait">
        {!showRegister ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.5, rotateX: 25 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotateX: -25 }}
            transition={{ duration: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h2 className="login-title">Iniciar Sesión</h2>
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="usuario">Usuario</label>
                <input
                  id="usuario"
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Tu usuario"
                  autoComplete="username"
                />
              </div>
              <div className="login-field">
                <label htmlFor="contrasena">Contraseña</label>
                <input
                  id="contrasena"
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="login-submit">
                Entrar
              </button>
            </form>
            <div className="login-links">
              <a href="#" className="login-link">¿Olvidaste tu contraseña?</a>
              <button onClick={() => setShowRegister(true)} className="login-link login-link-btn">
                Crear cuenta
              </button>
            </div>
            {onBack && (
              <button onClick={onBack} className="volver-btn" type="button">
                <div className="volver-btn-bg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="25px" width="25px">
                    <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
                    <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
                  </svg>
                </div>
                <p className="volver-btn-text">Volver</p>
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="register"
            initial={{ opacity: 0, scale: 0.5, rotateX: 25 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotateX: -25 }}
            transition={{ duration: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <Register onBack={() => setShowRegister(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
