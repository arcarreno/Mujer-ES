import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { sileo } from 'sileo'
import { getMyEnrollments, generateQrDataUrlFromPayload, unenrollFromCourse, type Enrollment, type Course } from '../../lib/queries'

type View = 'list' | 'detail'

interface MisCursosPageProps {
  onViewCourse?: (course: Course) => void
}

export default function MisCursosPage({ onViewCourse }: MisCursosPageProps) {
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<Course | null>(null)
  const [selectedEnrollment, setSelectedEnrollment] = useState<(Enrollment & { course: Course | null }) | null>(null)
  const [unenrolling, setUnenrolling] = useState(false)
  const [showQrPanel, setShowQrPanel] = useState(false)
  const [qrPanelDataUrl, setQrPanelDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => {
    getMyEnrollments()
      .then(setEnrollments)
      .catch(() => sileo.error({ title: 'Error', description: 'No se pudieron cargar tus cursos' }))
      .finally(() => setLoading(false))
  }, [])

  const openDetail = (enrollment: Enrollment & { course: Course | null }) => {
    if (!enrollment.course) return
    if (onViewCourse) {
      onViewCourse(enrollment.course)
      return
    }
    setSelected(enrollment.course)
    setSelectedEnrollment(enrollment)
    setView('detail')
    setShowQrPanel(false)
    setQrPanelDataUrl(null)
  }

  const goBack = () => {
    setView('list')
    setSelected(null)
    setSelectedEnrollment(null)
    setShowQrPanel(false)
    setQrPanelDataUrl(null)
  }

  const handleUnenroll = async () => {
    if (!selected || unenrolling) return
    if (!confirm(`¿Darte de baja de "${selected.title}"?`)) return
    setUnenrolling(true)
    try {
      await unenrollFromCourse(selected.id)
      setEnrollments(prev => prev.filter(e => e.course_id !== selected.id))
      sileo.success({ title: 'Baja exitosa', description: `Te diste de baja de "${selected.title}"` })
      goBack()
    } catch (err: any) {
      sileo.error({ title: 'Error', description: err.message || 'No se pudo dar de baja' })
    } finally {
      setUnenrolling(false)
    }
  }

  const handleShowQr = async () => {
    if (showQrPanel) {
      setShowQrPanel(false)
      return
    }
    setShowQrPanel(true)
    if (qrPanelDataUrl) return
    if (!selectedEnrollment?.qr_code) return
    setQrLoading(true)
    try {
      const dataUrl = await generateQrDataUrlFromPayload(selectedEnrollment.qr_code)
      setQrPanelDataUrl(dataUrl)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo generar el código QR' })
    } finally {
      setQrLoading(false)
    }
  }

  const active = enrollments.filter(e => e.course && !e.course.concluded)
  const concluded = enrollments.filter(e => e.course && e.course.concluded)

  // Detail view
  if (view === 'detail' && selected && selectedEnrollment) {
    return (
      <div className={`curso-detail-layout ${showQrPanel ? 'curso-detail-layout-with-result' : ''}`}>
        <div className="curso-detail">
          <div className="curso-detail-header">
            <button className="volver-btn-sm" onClick={goBack} type="button">
              <div className="volver-btn-sm-bg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
                  <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
                  <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
                </svg>
              </div>
              <p className="volver-btn-sm-text">Volver</p>
            </button>
            <div className="curso-detail-badges">
              <span className="curso-detail-badge">{selected.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
              {selected.location_name && (
                <span className="curso-detail-badge curso-detail-badge-location">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {selected.location_name}
                </span>
              )}
            </div>
          </div>

          <div className="curso-detail-body">
            <h2 className="curso-detail-title">{selected.title}</h2>
            {selected.subtitle && <p className="curso-detail-subtitle">{selected.subtitle}</p>}
            {selected.description && <p className="curso-detail-desc">{selected.description}</p>}
          </div>

          <div className="curso-detail-footer">
            <div className="curso-detail-enrolled">
              <div className="curso-detail-enrolled-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Inscripto
              </div>
              <button
                className="curso-detail-unenroll-btn"
                onClick={handleUnenroll}
                disabled={unenrolling}
                type="button"
              >
                {unenrolling ? 'Procesando...' : 'Darse de baja'}
              </button>
            </div>

            {selectedEnrollment.attended && (
              <div className="curso-meta-pill" style={{ background: '#ecfdf5', color: '#059669', alignSelf: 'center', marginTop: '0.5rem' }}>
                Presente
              </div>
            )}

            {selected.modality === 'presencial' && selectedEnrollment.qr_code && (
              <button
                className={`curso-detail-qr-btn ${showQrPanel ? 'curso-detail-qr-btn-active' : ''}`}
                onClick={handleShowQr}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="3" height="3" />
                </svg>
                Código QR
              </button>
            )}

            {selected.modality === 'virtual' && selectedEnrollment.access_code && (
              <div className="curso-detail-access-code">
                <p className="curso-detail-access-code-label">Código de acceso</p>
                <p className="curso-detail-access-code-value">{selectedEnrollment.access_code}</p>
              </div>
            )}
          </div>
        </div>

        {showQrPanel && (
          <div className="curso-qr-panel">
            <div className="curso-qr-panel-card">
              <h3 className="curso-qr-panel-title">Tu código QR</h3>
              <p className="curso-qr-panel-hint">Mostrá este código al organizador para registrar tu asistencia</p>
              {qrLoading ? (
                <div className="curso-qr-panel-loading">
                  <div className="curso-detail-spinner" />
                  <p>Generando código...</p>
                </div>
              ) : qrPanelDataUrl ? (
                <>
                  <div className="curso-qr-panel-img">
                    <img src={qrPanelDataUrl} alt="Código QR de asistencia" width="280" height="280" />
                  </div>
                  <p className="curso-qr-panel-sub">Código QR personal e intransferible</p>
                </>
              ) : (
                <p className="curso-qr-panel-error">No se pudo generar el código QR</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // List view
  if (loading) {
    return (
      <div className="cursos-page">
        <div className="cursos-header">
          <h2 className="cursos-title">Mis Cursos</h2>
        </div>
        <div className="cursos-loading">
          <div className="cursos-spinner" />
          <p>Cargando tus cursos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cursos-page">
      <div className="cursos-header">
        <h2 className="cursos-title">Mis Cursos</h2>
        <p className="cursos-subtitle">{enrollments.length} inscripci{enrollments.length !== 1 ? 'ones' : 'ón'}</p>
      </div>

      {enrollments.length === 0 ? (
        <div className="cursos-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="cursos-empty-icon">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <p className="cursos-empty-text">Todavía no estás inscripto en ningún curso</p>
          <p className="cursos-empty-hint">Explorá los cursos disponibles en la pestaña "Cursos"</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="cursos-list">
              {active.map((enrollment, i) => (
                <EnrollmentCard key={enrollment.id} enrollment={enrollment} onView={() => openDetail(enrollment)} delay={i * 50} />
              ))}
            </div>
          )}
          {concluded.length > 0 && (
            <>
              <h3 className="mis-cursos-section-title">Concluidos</h3>
              <div className="cursos-list">
                {concluded.map((enrollment, i) => (
                  <EnrollmentCard key={enrollment.id} enrollment={enrollment} onView={() => openDetail(enrollment)} delay={i * 50} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function EnrollmentCard({ enrollment, onView, delay }: { enrollment: Enrollment & { course: Course | null }; onView: () => void; delay: number }) {
  const course = enrollment.course
  if (!course) return null

  return (
    <motion.button
      className="curso-card"
      onClick={onView}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: delay / 1000 }}
      type="button"
    >
      <div className="curso-card-thumb" style={{ background: 'linear-gradient(135deg, #581C87, #7C3AED)' }}>
        <span className="curso-card-thumb-letter">{course.title.charAt(0).toUpperCase()}</span>
      </div>
      <div className="curso-card-body">
        <h3 className="curso-card-title">{course.title}</h3>
        {course.subtitle && <p className="curso-card-desc">{course.subtitle}</p>}
        <div className="curso-card-meta">
          <span className={`curso-meta-pill ${course.modality === 'presencial' ? 'presencial' : 'virtual'}`}>
            {course.modality === 'presencial' ? 'Presencial' : 'Virtual'}
          </span>
          {enrollment.attended && (
            <span className="curso-meta-pill" style={{ background: '#ecfdf5', color: '#059669' }}>Presente</span>
          )}
          {course.concluded && (
            <span className="curso-meta-pill" style={{ background: '#f3f4f6', color: '#6b7280' }}>Concluido</span>
          )}
        </div>
      </div>
      <div className="curso-card-arrow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </motion.button>
  )
}
