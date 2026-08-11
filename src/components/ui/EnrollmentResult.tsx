import { useState } from 'react'

interface EnrollmentResultProps {
  modality: string
  qrCodeDataUrl?: string
  accessCode?: string
  courseName: string
  onClose: () => void
}

export default function EnrollmentResult({ modality, qrCodeDataUrl, accessCode, courseName, onClose }: EnrollmentResultProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!accessCode) return
    await navigator.clipboard.writeText(accessCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (modality === 'presencial' && qrCodeDataUrl) {
    return (
      <div className="enrollment-result-inline">
        <div className="enrollment-result-card">
          <div className="enrollment-result-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="enrollment-result-title">Inscripción exitosa</h3>
          <p className="enrollment-result-course">{courseName}</p>
          <p className="enrollment-result-hint">Mostrá este código QR al organizador para registrar tu asistencia</p>
          <div className="enrollment-result-qr">
            <img src={qrCodeDataUrl} alt="Código QR de asistencia" width="180" height="180" />
          </div>
          <p className="enrollment-result-sub">Código QR personal e intransferible</p>
          <button className="enrollment-result-close" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  if (modality === 'virtual' && accessCode) {
    return (
      <div className="enrollment-result-inline">
        <div className="enrollment-result-card">
          <div className="enrollment-result-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="enrollment-result-title">Inscripción exitosa</h3>
          <p className="enrollment-result-course">{courseName}</p>
          <p className="enrollment-result-hint">Tu asistencia se registra automáticamente al entrar a la videollamada</p>
          <div className="enrollment-result-code" onClick={handleCopy} role="button" tabIndex={0}>
            {accessCode}
          </div>
          <p className="enrollment-result-sub">{copied ? '¡Copiado!' : 'Tocá para copiar'}</p>
          <button className="enrollment-result-close" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return null
}
