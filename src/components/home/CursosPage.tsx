import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import { listPublishedCourses, enrollInCourse, unenrollFromCourse, isEnrolledInCourse, isCourseFull, getCourseEnrollments, getMyEnrollmentForCourse, generateQrDataUrlFromPayload, getCourseImages, type Course } from '../../lib/queries'
import EnrollmentResult from '../ui/EnrollmentResult'
import ImageCarousel from '../ui/ImageCarousel'
import VideoCall from '../ui/VideoCall'

type View = 'list' | 'detail'

interface EnrollmentInfo {
  modality: string
  qrCodeDataUrl?: string
  accessCode?: string
  courseName: string
}

interface CursosPageProps {
  onNavigateToMap?: () => void
}

export default function CursosPage({ onNavigateToMap }: CursosPageProps) {
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
  const [myAccessCode, setMyAccessCode] = useState<string | null>(null)
  const [showCodePanel, setShowCodePanel] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const [inSession, setInSession] = useState(false)

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
    setMyAccessCode(null)
    setShowCodePanel(false)
    setCodeCopied(false)
    setGalleryImages([])
    try {
      const [isEnrolled, full, enrollments, images] = await Promise.all([
        isEnrolledInCourse(course.id),
        isCourseFull(course.id),
        getCourseEnrollments(course.id),
        getCourseImages(course.id).catch(() => []),
      ])
      setEnrolled(isEnrolled)
      setCourseFull(full)
      setEnrollmentCount(enrollments.length)
      setGalleryImages(images.map(img => img.image_url))
      if (isEnrolled) {
        const myEnrollment = await getMyEnrollmentForCourse(course.id)
        if (myEnrollment?.qr_code) setMyQrPayload(myEnrollment.qr_code)
        if (myEnrollment?.access_code) setMyAccessCode(myEnrollment.access_code)
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
      if (result.accessCode) setMyAccessCode(result.accessCode)
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
    setShowCodePanel(false)
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

  const handleShowCode = () => {
    setShowCodePanel(prev => !prev)
    setShowQrPanel(false)
  }

  const handleCopyCode = async () => {
    if (!myAccessCode) return
    try {
      await navigator.clipboard.writeText(myAccessCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo copiar el código' })
    }
  }

  if (view === 'detail' && selected) {
    return (
      <div className="curso-detail-layout">
        <div className="curso-detail">
          <div className="curso-detail-header">
            <button
              className="volver-btn-sm"
              onClick={() => { setView('list'); setSelected(null); setEnrollmentResult(null); setShowQrPanel(false) }}
              type="button"
            >
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

          {(selected.event_date || selected.event_time || selected.event_duration_minutes) && (
            <div className="curso-detail-event-info">
              {selected.event_date && (
                <div className="curso-detail-event-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{new Date(selected.event_date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              )}
              {selected.event_time && (
                <div className="curso-detail-event-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{selected.event_time.slice(0, 5)} hrs</span>
                </div>
              )}
              {selected.event_duration_minutes && (
                <div className="curso-detail-event-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>{selected.event_duration_minutes} min</span>
                </div>
              )}
            </div>
          )}

          {selected.modality === 'presencial' && selected.latitude && selected.longitude && (
            <button
              className="curso-detail-location-btn"
              onClick={() => onNavigateToMap?.()}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Ubicación
            </button>
          )}

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
              <>
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
                {showQrPanel && (
                  <div className="curso-inline-qr">
                    {qrLoading ? (
                      <div className="curso-qr-panel-loading">
                        <div className="curso-detail-spinner" />
                        <p>Generando código...</p>
                      </div>
                    ) : qrPanelDataUrl ? (
                      <>
                        <div className="curso-inline-qr-img">
                          <img src={qrPanelDataUrl} alt="Código QR de asistencia" width="200" height="200" />
                        </div>
                        <p className="curso-inline-qr-hint">Código QR personal e intransferible</p>
                      </>
                    ) : (
                      <p className="curso-qr-panel-error">No se pudo generar el código QR</p>
                    )}
                  </div>
                )}
              </>
            )}

            {enrolled && selected.modality === 'virtual' && myAccessCode && (
              <>
                <button
                  className={`curso-detail-qr-btn ${showCodePanel ? 'curso-detail-qr-btn-active' : ''}`}
                  onClick={handleShowCode}
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Mi código
                </button>
                {showCodePanel && (
                  <div className="curso-inline-code">
                    <div className="curso-inline-code-value" onClick={handleCopyCode} role="button" tabIndex={0}>
                      {myAccessCode}
                    </div>
                    <p className="curso-inline-code-hint">{codeCopied ? '¡Copiado!' : 'Tocá para copiar'}</p>
                  </div>
                )}
              </>
            )}

            {enrolled && selected.modality === 'virtual' && selected.session_active && (
              <button
                className="curso-detail-join-btn"
                onClick={() => setInSession(true)}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Entrar a clase
              </button>
            )}
          </div>

          {enrollmentResult && (
            <EnrollmentResult
              modality={enrollmentResult.modality}
              qrCodeDataUrl={enrollmentResult.qrCodeDataUrl}
              accessCode={enrollmentResult.accessCode}
              courseName={enrollmentResult.courseName}
              onClose={() => setEnrollmentResult(null)}
            />
          )}

          {(selected.cover_image_url || galleryImages.length > 0) && (
            <div className="curso-detail-images">
              <ImageCarousel
                images={selected.cover_image_url
                  ? (galleryImages.length > 0 ? [selected.cover_image_url, ...galleryImages] : [selected.cover_image_url])
                  : galleryImages
                }
              />
            </div>
          )}

          {inSession && selected.modality === 'virtual' && (
            <VideoCall
              courseId={selected.id}
              isAdmin={false}
              onClose={() => setInSession(false)}
            />
          )}
        </div>
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
              <div className={`curso-card-image ${!curso.cover_image_url ? 'curso-card-image--fallback' : ''}`}>
                {curso.cover_image_url ? (
                  <img src={curso.cover_image_url} alt="" className="curso-card-cover" loading="lazy" />
                ) : (
                  <svg className="curso-card-image-fallback-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
                <div className="curso-card-overlay" />
                <div className="curso-card-image-content">
                  <h3 className="curso-card-title">{curso.title}</h3>
                  {curso.description && <p className="curso-card-desc">{curso.description}</p>}
                  <div className="curso-card-meta">
                    <span className="curso-meta-pill">{curso.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
                    {curso.session_active && curso.modality === 'virtual' && (
                      <span className="curso-meta-pill curso-meta-pill-live">
                        <span className="live-dot-sm" />
                        EN VIVO
                      </span>
                    )}
                    {curso.location_name && <span className="curso-meta-pill">{curso.location_name}</span>}
                  </div>
                </div>
              </div>
              <svg className="curso-card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
