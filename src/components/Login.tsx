import { useState } from 'react'

interface LoginProps {
  onBack?: () => void
}

export default function Login({ onBack }: LoginProps) {
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <div className="login-container">
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
        <a href="#" className="login-link">Crear cuenta</a>
      </div>
      {onBack && (
        <button onClick={onBack} className="login-back">
          ← Volver
        </button>
      )}
    </div>
  )
}
