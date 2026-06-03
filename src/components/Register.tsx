import { useState } from 'react'

interface RegisterProps {
  onBack?: () => void
}

export default function Register({ onBack }: RegisterProps) {
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [telefono, setTelefono] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <>
      <h2 className="login-title">Crear Cuenta</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <div className="login-field">
          <label htmlFor="nombre">Nombre completo</label>
          <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre completo"
            autoComplete="name"
          />
        </div>
        <div className="login-field">
          <label htmlFor="reg-usuario">Usuario</label>
          <input
            id="reg-usuario"
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Elige un usuario"
            autoComplete="username"
          />
        </div>
        <div className="login-field">
          <label htmlFor="reg-contrasena">Contraseña</label>
          <input
            id="reg-contrasena"
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            placeholder="Elige una contraseña"
            autoComplete="new-password"
          />
        </div>
        <div className="login-field">
          <label htmlFor="telefono">Número de teléfono</label>
          <input
            id="telefono"
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Tu número de teléfono"
            autoComplete="tel"
          />
        </div>
        <button type="submit" className="login-submit">
          Crear Cuenta
        </button>
      </form>
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
    </>
  )
}
