import { useState } from 'react'
import { motion } from 'motion/react'
import { reportUser } from '../../lib/queries'
import { sileo } from 'sileo'

interface ReportModalProps {
  userId: string
  onClose: () => void
}

export default function ReportModal({ userId, onClose }: ReportModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (reason.trim().length < 10) return
    setSubmitting(true)
    try {
      await reportUser(userId, reason)
      sileo.success({ title: 'Reporte enviado', description: 'Gracias por ayudarnos a mantener la comunidad segura' })
      onClose()
    } catch (e: any) {
      sileo.error({ title: 'Error', description: e.message || 'No se pudo enviar el reporte' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="report-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="report-modal-title">Reportar usuario</h3>
        <p className="report-modal-desc">
          Describe el motivo del reporte. Los reportes falsos pueden resultar en sanciones.
        </p>

        <textarea
          className="report-modal-textarea"
          placeholder="Escribí el motivo del reporte (mínimo 10 caracteres)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={4}
        />

        <div className="report-modal-footer">
          <span className="report-modal-count">{reason.length}/500</span>
          <div className="report-modal-actions">
            <button className="report-modal-btn cancel" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="report-modal-btn submit"
              onClick={handleSubmit}
              disabled={reason.trim().length < 10 || submitting}
              type="button"
            >
              {submitting ? 'Enviando...' : 'Enviar reporte'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
