import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import { listPublishedCourses, enrollInCourse, unenrollFromCourse, isEnrolledInCourse, isCourseFull, getCourseEnrollments, getMyEnrollmentForCourse, generateQrDataUrlFromPayload, type Course } from '../../lib/queries'
import EnrollmentResult from '../ui/EnrollmentResult'

type View = 'list' | 'detail'

interface EnrollmentInfo {
  modality: string
  qrCodeDataUrl?: string
  accessCode?: string
  courseName: string
}

export default function CursosPage({ onOpenChat }: { onOpenChat?: () => void } = {}) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<Course | null>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollCheck, setEnrollCheck] = useState(true)
  const [courseFull, setCourseFull] = useState(false)
  const [enrollmentCount, setEnrollmentCount] = useState(0)
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentInfo | null>(null)
  const [myQrPayload, setMyQrPayload] = useState<string | null>(null)
  const [showQrPanel, setShowQrPanel] = useState(false)
  const [qrPanelDataUrl, setQrPanelDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    listPublishedCourses()
      .then(setCourses)
      .catch(() => sileo.error({ title: 'Error', description: 'No se pudieron cargar los cursos' }))
      .finally(() => setLoading(false))
  }, [])

  const openDetail = async (course: Course) => {
    setSelected(course)
    setView('detail')
    setEnrollCheck(true)
    setShowQrPanel(false)
    setQrPanelDataUrl(null)
    setMyQrPayload(null)
    try {
      const [isEnrolled, full, enrollments] = await Promise.all([
        isEnrolledInCourse(course.id),
        isCourseFull(course.id),
        getCourseEnrollments(course.id),
      ])
      setEnrolled(isEnrolled)
      setCourseFull(full)
      setEnrollmentCount(enrollments.length)
      if (isEnrolled) {
        const myEnrollment = await getMyEnrollmentForCourse(course.id)
        if (myEnrollment?.qr_code) setMyQrPayload(myEnrollment.qr_code)
      }
    } catch {
      setEnrolled(false)
      setCourseFull(false)
      setEnrollmentCount(0)
    } finally {
      setEnrollCheck(false)
    }
  }

  const handleEnroll = async () => {
    if (!selected || enrolling) return
    setEnrolling(true)
    try {
      const result = await enrollInCourse(selected.id)
      setEnrolled(true)
      setEnrollmentResult({
        modality: result.modality,
        qrCodeDataUrl: result.qrCodeDataUrl,
        accessCode: result.accessCode,
        courseName: selected.title,
      })
      if (result.qrPayload) setMyQrPayload(result.qrPayload)
    } catch (err: any) {
      sileo.error({ title: 'Error', description: err.message || 'No se pudo inscribir' })
    } finally {
      setEnrolling(false)
    }
  }

  const handleUnenroll = async () => {
    if (!selected || enrolling) return
    if (!confirm(`¿Darte de baja de "${selected.title}"?`)) return
    setEnrolling(true)
    try {
      await unenrollFromCourse(selected.id)
      setEnrolled(false)
      setShowQrPanel(false)
      setMyQrPayload(null)
      sileo.success({ title: 'Baja exitosa', description: `Te diste de baja de "${selected.title}"` })
    } catch (err: any) {
      sileo.error({ title: 'Error', description: err.message || 'No se pudo dar de baja' })
    } finally {
      setEnrolling(false)
    }
  }

  const handleShowQr = async () => {
    if (showQrPanel) {
      setShowQrPanel(false)
      return
    }
    setShowQrPanel(true)
    if (qrPanelDataUrl) return
    if (!myQrPayload) return
    setQrLoading(true)
    try {
      const dataUrl = await generateQrDataUrlFromPayload(myQrPayload)
      setQrPanelDataUrl(dataUrl)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo generar el código QR' })
    } finally {
      setQrLoading(false)
    }
  }

  if (view === 'detail' && selected) {
    return (
      <div className={`curso-detail-layout ${showQrPanel ? 'curso-detail-layout-with-result' : ''}`}>
        <div className="curso-detail">
          <div className="curso-detail-header">
            <button
              className="curso-detail-back"
              onClick={() => { setView('list'); setSelected(null); setEnrollmentResult(null); setShowQrPanel(false) }}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Volver
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
            {selected.max_enrollments && (
              <div className={`curso-detail-vacancies ${courseFull ? 'curso-detail-vacancies-full' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                <span>
                  {enrollmentCount} / {selected.max_enrollments} vacante{selected.max_enrollments !== 1 ? 's' : ''}
                </span>
                {courseFull && <span className="curso-detail-vacancies-badge">Lleno</span>}
              </div>
            )}
            {enrollCheck ? (
              <div className="curso-detail-footer-loading">
                <div className="curso-detail-spinner" />
              </div>
            ) : enrolled ? (
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
                  disabled={enrolling}
                  type="button"
                >
                  {enrolling ? 'Procesando...' : 'Darse de baja'}
                </button>
              </div>
            ) : courseFull ? (
              <div className="curso-detail-full-msg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                No hay vacantes disponibles
              </div>
            ) : (
              <button
                className="curso-detail-enroll-btn"
                onClick={handleEnroll}
                disabled={enrolling}
                type="button"
              >
                {enrolling ? (
                  <>
                    <div className="curso-detail-spinner-light" />
                    Inscribiendo...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Inscribirse
                  </>
                )}
              </button>
            )}

            {enrolled && selected.modality === 'presencial' && myQrPayload && (
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

        {enrollmentResult && (
          <EnrollmentResult
            modality={enrollmentResult.modality}
            qrCodeDataUrl={enrollmentResult.qrCodeDataUrl}
            accessCode={enrollmentResult.accessCode}
            courseName={enrollmentResult.courseName}
            onClose={() => setEnrollmentResult(null)}
          />
        )}
      </div>
    )
  }

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.subtitle?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="cursos-page">
      <div className="cursos-header">
        <h2 className="cursos-title">Cursos</h2>
        <p className="cursos-subtitle">Aprende a tu ritmo, en cualquier momento</p>
      </div>

      {!selected && (
        <div className="cursos-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar cursos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="cursos-loading">
          <div className="cursos-spinner" />
          <p>Cargando cursos...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="cursos-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <p>No hay cursos disponibles</p>
          <span>Cuando se publiquen cursos, aparecerán aquí</span>
        </div>
      ) : (
        <div className="cursos-list">
          {filtered.map((curso, i) => (
            <article
              key={curso.id}
              className="curso-card"
              style={{ animationDelay: `${i * 80}ms` }}
              onClick={() => openDetail(curso)}
              role="button"
              tabIndex={0}
            >
              <div className="curso-card-thumb" aria-hidden>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <div className="curso-card-body">
                <h3 className="curso-card-title">{curso.title}</h3>
                <p className="curso-card-desc">{curso.description}</p>
                <div className="curso-card-meta">
                  <span className="curso-meta-pill">{curso.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
                  {curso.location_name && <span className="curso-meta-pill curso-meta-pill-location">{curso.location_name}</span>}
                </div>
              </div>
              <svg className="curso-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </article>
          ))}
        </div>
      )}
      {/* Floating chat button */}
      {onOpenChat && (
        <button
          className="chat-fab"
          onClick={onOpenChat}
          aria-label="Abrir chat"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  )
}
