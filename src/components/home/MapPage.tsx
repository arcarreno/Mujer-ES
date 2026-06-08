import { useState, useEffect } from 'react'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sileo } from 'sileo'
import { listPublishedCourses, enrollInCourse, unenrollFromCourse, isEnrolledInCourse, isCourseFull, getCourseEnrollments, getMyEnrollmentForCourse, generateQrDataUrlFromPayload, type Course } from '../../lib/queries'
import { MapControls, MapTileLayer, PUEBLA_CENTER, PUEBLA_ZOOM, type LayerType } from '../ui/MapControls'
import EnrollmentResult from '../ui/EnrollmentResult'

function courseIcon(color: string) {
  return L.divIcon({
    className: 'map-marker-pointer',
    html: `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="16" r="8" fill="white"/>
      <path d="M12 13.5C12 12.672 12.672 12 13.5 12h5c.828 0 1.5.672 1.5 1.5V17h-1v-3.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5V17h-1v-3.5z" fill="${color}"/>
      <rect x="12" y="17.5" width="8" height="1" rx="0.5" fill="${color}"/>
      <rect x="12" y="19.5" width="6" height="1" rx="0.5" fill="${color}"/>
    </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -46],
  })
}

export default function MapPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Course | null>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollCheck, setEnrollCheck] = useState(false)
  const [courseFull, setCourseFull] = useState(false)
  const [enrollmentCount, setEnrollmentCount] = useState(0)
  const [layerType, setLayerType] = useState<LayerType>('map')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [enrollmentResult, setEnrollmentResult] = useState<{ modality: string; qrCodeDataUrl?: string; accessCode?: string; courseName: string } | null>(null)
  const [myQrPayload, setMyQrPayload] = useState<string | null>(null)
  const [showQrPanel, setShowQrPanel] = useState(false)
  const [qrPanelDataUrl, setQrPanelDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => {
    listPublishedCourses()
      .then((data) => setCourses(data.filter((c) => c.latitude && c.longitude)))
      .catch(() => sileo.error({ title: 'Error', description: 'No se pudieron cargar los cursos' }))
      .finally(() => setLoading(false))
  }, [])

  const openDetail = async (course: Course) => {
    setSelected(course)
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
      if (result.qrCodeDataUrl && selected.modality === 'presencial') {
        const myEnrollment = await getMyEnrollmentForCourse(selected.id)
        if (myEnrollment?.qr_code) setMyQrPayload(myEnrollment.qr_code)
      }
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

  if (selected) {
    return (
      <>
        <div className={`curso-detail-layout ${showQrPanel ? 'curso-detail-layout-with-result' : ''}`}>
          <div className="curso-detail">
            <div className="curso-detail-header">
              <button
                className="curso-detail-back"
                onClick={() => { setSelected(null); setEnrollmentResult(null); setShowQrPanel(false) }}
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Volver al mapa
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
                <button className="curso-detail-unenroll-btn" onClick={handleUnenroll} disabled={enrolling} type="button">
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
              <button className="curso-detail-enroll-btn" onClick={handleEnroll} disabled={enrolling} type="button">
                {enrolling ? (
                  <>
                    <div className="curso-detail-spinner-light" />
                    Inscribiendo
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
      </>
    )
  }

  if (loading) {
    return (
      <div className="map-page-empty">
        <p>Cargando mapa...</p>
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div className="map-page-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <p>No hay cursos presenciales</p>
        <span>Los cursos presenciales con ubicación aparecerán aquí</span>
      </div>
    )
  }

  return (
    <div className={`map-page ${isFullscreen ? 'map-page-fullscreen' : ''}`}>
      {!isFullscreen && (
        <div className="map-page-header">
          <h2 className="cursos-title">Mapa de cursos</h2>
          <p className="cursos-subtitle">{courses.length} curso{courses.length !== 1 ? 's' : ''} presencial{courses.length !== 1 ? 'es' : ''}</p>
        </div>
      )}
      <div className="map-page-container">
        <MapContainer
          key={`${layerType}-${isFullscreen}`}
          center={PUEBLA_CENTER}
          zoom={PUEBLA_ZOOM}
          style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
        >
          <MapTileLayer layerType={layerType} />
          {courses.map((course) => (
            <Marker
              key={course.id}
              position={[course.latitude!, course.longitude!]}
              icon={courseIcon('#581C87')}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{course.title}</strong>
                  {course.location_name && <p className="map-popup-location">{course.location_name}</p>}
                  {course.subtitle && <p className="map-popup-subtitle">{course.subtitle}</p>}
                  <button
                    className="map-popup-btn"
                    onClick={() => openDetail(course)}
                    type="button"
                  >
                    Ver curso
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <MapControls
          layerType={layerType}
          onToggleLayer={() => setLayerType((t) => t === 'map' ? 'satellite' : 'map')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((f) => !f)}
        />
      </div>
    </div>
  )
}
