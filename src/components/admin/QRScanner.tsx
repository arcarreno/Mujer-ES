import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { markAttendance } from '../../lib/queries'

interface QRScannerProps {
  onScanResult: (username: string, courseName: string) => void
  onClose: () => void
}

export default function QRScanner({ onScanResult, onClose }: QRScannerProps) {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const activeRef = useRef(false)
  const processingRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    activeRef.current = true

    const scannerId = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const div = document.createElement('div')
    div.id = scannerId
    container.appendChild(div)

    const scanner = new Html5Qrcode(scannerId)
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
      },
      async (decodedText) => {
        if (!activeRef.current || processingRef.current) return
        activeRef.current = false
        processingRef.current = true
        setProcessing(true)

        try {
          const result = await markAttendance(decodedText)
          if (!processingRef.current) return
          onScanResult(result.username, result.courseName)
        } catch (err: any) {
          activeRef.current = true
          processingRef.current = false
          setProcessing(false)
          setError(err.message || 'Error al registrar asistencia')
        }
      },
      () => {}
    ).catch(() => {
      if (activeRef.current) setError('No se pudo acceder a la cámara')
    })

    return () => {
      activeRef.current = false
      try {
        if (scannerRef.current?.isScanning) {
          scannerRef.current.stop()
        }
        scannerRef.current?.clear()
        scannerRef.current = null
      } catch {}
      if (container.contains(div)) {
        container.removeChild(div)
      }
    }
  }, [])

  const handleClose = () => {
    activeRef.current = false
    try {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop()
      }
      scannerRef.current?.clear()
      scannerRef.current = null
    } catch {}
    onClose()
  }

  return (
    <div className="qr-scanner-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="qr-scanner-card">
        <div className="qr-scanner-header">
          <h3 className="qr-scanner-title">Escanear código QR</h3>
          <button className="qr-scanner-close" onClick={handleClose} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="qr-scanner-body">
          {processing ? (
            <div className="qr-scanner-processing">
              <div className="curso-detail-spinner" />
              <p>Registrando asistencia...</p>
            </div>
          ) : (
            <>
              <div ref={containerRef} className="qr-scanner-viewport" />
              {error && (
                <div className="qr-scanner-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {error}
                </div>
              )}
              {!error && (
                <>
                  <p className="qr-scanner-hint">Apuntá la cámara al código QR del usuario</p>
                  <button className="qr-scanner-cancel" onClick={handleClose} type="button">
                    Cancelar
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
