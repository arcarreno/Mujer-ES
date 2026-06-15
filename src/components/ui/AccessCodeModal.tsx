import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'

interface AccessCodeModalProps {
  isOpen: boolean
  onClose: () => void
  onAccessGranted: () => void
  courseTitle: string
  expectedCode: string | null
}

export default function AccessCodeModal({ isOpen, onClose, onAccessGranted, courseTitle, expectedCode }: AccessCodeModalProps) {
  const [code, setCode] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', ''])
      setError('')
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [isOpen])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value.slice(-1)
    setCode(newCode)
    setError('')

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newCode.every(d => d !== '')) {
      handleSubmit(newCode.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (pasted.length === 4) {
      const newCode = pasted.split('')
      setCode(newCode)
      setError('')
      inputRefs.current[3]?.focus()
      handleSubmit(pasted)
    }
  }

  const handleSubmit = async (codeStr: string) => {
    if (loading) return
    setLoading(true)

    // Simular delay de validación
    await new Promise(resolve => setTimeout(resolve, 500))

    if (expectedCode && codeStr === expectedCode) {
      onAccessGranted()
    } else {
      setError('Código incorrecto. Inscribite a un curso o esperá a que abra una nueva sesión.')
      setCode(['', '', '', ''])
      inputRefs.current[0]?.focus()
    }
    setLoading(false)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="access-code-modal"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="access-code-header">
              <h3>Ingresar a Videollamada</h3>
              <p className="access-code-course">{courseTitle}</p>
            </div>

            <div className="access-code-body">
              <p className="access-code-instruction">
                Ingresá el código de 4 dígitos de tu curso
              </p>

              <div className="access-code-inputs" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className={`access-code-input ${error ? 'error' : ''} ${digit ? 'filled' : ''}`}
                    disabled={loading}
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              {error && (
                <motion.p
                  className="access-code-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {error}
                </motion.p>
              )}

              {loading && (
                <div className="access-code-loading">
                  <div className="curso-detail-spinner" />
                  <p>Validando código...</p>
                </div>
              )}
            </div>

            <div className="access-code-footer">
              <button
                className="access-code-cancel"
                onClick={onClose}
                disabled={loading}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
