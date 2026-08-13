import { useState, useEffect, useRef } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sileo } from 'sileo'
import { listPublishedCourses, enrollInCourse, unenrollFromCourse, isEnrolledInCourse, isCourseFull, getCourseEnrollments, getMyEnrollmentForCourse, generateQrDataUrlFromPayload, getCourseImages, type Course } from '../../lib/queries'
import { MapControls, MapTileLayer, PUEBLA_CENTER, PUEBLA_ZOOM, type LayerType } from '../ui/MapControls'
import EnrollmentResult from '../ui/EnrollmentResult'
import MapillaryViewer from '../ui/MapillaryViewer'
import MapillaryCoverage from '../ui/MapillaryCoverage'
import ImageCarousel from '../ui/ImageCarousel'
import RoutePanel from '../ui/RoutePanel'
import { calcularRuta, estimarTiempos, type RutaCalculada } from '../../lib/routing'

// Helper component to fly the map (must be inside MapContainer)
function MapFlyTo({ target }: { target: { center: [number, number]; zoom: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) {
      map.flyTo(target.center, target.zoom, { duration: 1 })
    }
  }, [target, map])
  return null
}

// La pestaña del mapa queda montada pero oculta (display:none) entre visitas;
// Leaflet calcula el tamaño al montar, así que al volver a mostrarla hay que
// recalcular el layout o los tiles quedan con dimensiones de 0x0.
function MapResizeHandler({ active }: { active: boolean }) {
  const map = useMap()
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) {
      const t = setTimeout(() => map.invalidateSize(), 0)
      wasActive.current = true
      return () => clearTimeout(t)
    }
    wasActive.current = active
  }, [active, map])
  return null
}

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

function originIcon(color = '#16a34a') {
  return L.divIcon({
    className: 'map-marker-origin',
    html: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="13" r="10" fill="${color}" stroke="white" stroke-width="3"/>
    </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado'
}

// Fit the map bounds to the route (must be inside MapContainer)
function MapFitRoute({ route, origin }: { route: RutaCalculada | null; origin: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!route || !origin) return
    const bounds = L.latLngBounds([[origin[0], origin[1]], ...route.puntos.map((p) => [p.lat, p.lng] as [number, number])])
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 640
    map.fitBounds(
      bounds,
      mobile
        ? { paddingTopLeft: [40, 60], paddingBottomRight: [40, 220], maxZoom: 16 }
        : { padding: [70, 70], maxZoom: 16 }
    )
  }, [map, route, origin])
  return null
}

// Captura clicks en el mapa para elegir el punto de partida (modo picking)
function PickOriginLayer({ active, onPick }: { active: boolean; onPick: (latlng: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      if (active) onPick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

// Buttons inside the popup that close it and run an action (popup children share the map context)
function PopupActions({ course, onView, onDirections }: { course: Course; onView: (c: Course) => void; onDirections: (c: Course) => void }) {
  const map = useMap()
  return (
    <div className="map-popup-actions">
      <button
        className="map-popup-btn"
        onClick={() => {
          map.closePopup()
          onView(course)
        }}
        type="button"
      >
        Ver curso
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <button
        className="map-popup-btn map-popup-btn-street"
        onClick={() => {
          map.closePopup()
          onDirections(course)
        }}
        type="button"
        title="Cómo llegar"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="19" r="3" />
          <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
          <circle cx="18" cy="5" r="3" />
        </svg>
        Cómo llegar
      </button>
    </div>
  )
}

export default function MapPage({ active = true }: { active?: boolean }) {
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
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const [streetView, setStreetView] = useState<{ lat: number; lng: number } | null>(null)
  const [mapillaryMode, setMapillaryMode] = useState(false)
  const [showMapillaryModal, setShowMapillaryModal] = useState(false)
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [routeOrigin, setRouteOrigin] = useState<[number, number] | null>(null)
  const [route, setRoute] = useState<RutaCalculada | null>(null)
  const [routeCourse, setRouteCourse] = useState<Course | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [pickOrigin, setPickOrigin] = useState(false)

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
    } catch (err) {
      sileo.error({ title: 'Error', description: mensajeError(err) || 'No se pudo inscribir' })
    } finally {
      setEnrolling(false)
    }
  }

  const handleUnenroll = async () => {
    if (!selected || enrolling) return
    if (!confirm(`¿Darte de baja de  "${selected.title}"?`)) return
    setEnrolling(true)
    try {
      await unenrollFromCourse(selected.id)
      setEnrolled(false)
      setShowQrPanel(false)
      setMyQrPayload(null)
      sileo.success({ title: 'Baja exitosa', description: `Te diste de baja de "${selected.title}"` })
    } catch (err) {
      sileo.error({ title: 'Error', description: mensajeError(err) || 'No se pudo dar de baja' })
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

  const getCurrentPosition = (): Promise<[number, number]> =>
    new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Tu navegador no tiene geolocalización. Tocá el mapa para elegir tu punto de partida'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
        () => reject(new Error('No se pudo obtener tu ubicación. Activá la geolocalización o tocá el mapa para elegir tu punto de partida')),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      )
    })

  const handleDirections = async (course: Course) => {
    if (!course.latitude || !course.longitude) return
    setRouteCourse(course)
    setRoute(null)
    setRouteOrigin(null)
    setPickOrigin(false)
    setRouteLoading(true)
    try {
      const [lat, lng] = await getCurrentPosition()
      setRouteOrigin([lat, lng])
      try {
        const ruta = await calcularRuta(
          { lat, lng },
          { lat: course.latitude, lng: course.longitude }
        )
        setRoute(ruta)
      } catch (err) {
        setRoute(null)
        sileo.error({ title: 'Error', description: mensajeError(err) || 'No se pudo calcular la ruta' })
      }
    } catch (err) {
      // Geolocalización falló o fue denegada → modo "elegí el punto de partida en el mapa"
      setRoute(null)
      setRouteOrigin(null)
      setPickOrigin(true)
      sileo.error({ title: 'Ubicación', description: mensajeError(err) })
    } finally {
      setRouteLoading(false)
    }
  }

  const handlePickOrigin = async (latlng: [number, number]) => {
    if (!routeCourse || routeLoading) return
    setPickOrigin(false)
    setRouteOrigin(latlng)
    setRouteLoading(true)
    try {
      const ruta = await calcularRuta(
        { lat: latlng[0], lng: latlng[1] },
        { lat: routeCourse.latitude!, lng: routeCourse.longitude! }
      )
      setRoute(ruta)
    } catch (err) {
      setRoute(null)
      sileo.error({ title: 'Error', description: mensajeError(err) || 'No se pudo calcular la ruta' })
    } finally {
      setRouteLoading(false)
    }
  }

  const closeRoutePanel = () => {
    setRoute(null)
    setRouteCourse(null)
    setRouteOrigin(null)
    setPickOrigin(false)
  }

  if (selected) {
    return (
      <>
        <div className={`curso-detail-layout ${showQrPanel ? 'curso-detail-layout-with-result' : ''}`}>
          <div className="curso-detail">
            <div className="curso-detail-header">
              <button
                className="volver-btn-sm"
                onClick={() => { setSelected(null); setEnrollmentResult(null); setShowQrPanel(false) }}
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
      <div className={`map-page-container ${mapillaryMode ? 'mapillary-cursor' : ''} ${pickOrigin ? 'route-pick-cursor' : ''}`}>
        <MapContainer
          key={`${layerType}-${isFullscreen}`}
          center={PUEBLA_CENTER}
          zoom={PUEBLA_ZOOM}
          style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
        >
          <MapTileLayer layerType={layerType} />
          <MapResizeHandler active={active} />
          <MapFlyTo target={flyTarget} />
          <MapFitRoute route={route} origin={routeOrigin} />
          <PickOriginLayer active={pickOrigin} onPick={handlePickOrigin} />
          <MapillaryCoverage
            active={mapillaryMode}
            onImageClick={(imageId) => {
              // For now, just log the image ID. In a future enhancement, open the viewer.
              console.log('Mapillary image clicked:', imageId)
            }}
          />
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
                  <PopupActions
                    course={course}
                    onView={openDetail}
                    onDirections={handleDirections}
                  />
                </div>
              </Popup>
            </Marker>
          ))}
          {route && routeOrigin && (
            <>
              <Marker position={routeOrigin} icon={originIcon()} />
              <Polyline
                positions={[[routeOrigin[0], routeOrigin[1]], ...route.puntos.map((p) => [p.lat, p.lng] as [number, number])]}
                pathOptions={{ color: '#581C87', weight: 4, opacity: 0.85 }}
              />
            </>
          )}
        </MapContainer>
        {routeCourse && routeLoading && (
          <div className="route-panel route-panel-loading">
            <div className="route-panel-spinner" />
            <p>Calculando la mejor ruta...</p>
          </div>
        )}
        {routeCourse && pickOrigin && (
          <div className="route-panel route-panel-pick">
            <button className="route-panel-close" onClick={closeRoutePanel} type="button" aria-label="Cerrar indicaciones">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <svg className="route-panel-pick-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <h3 className="route-panel-pick-title">Elegí tu punto de partida</h3>
            <p className="route-panel-pick-text">
              No pudimos obtener tu ubicación. Tocá cualquier lugar del mapa para calcular la ruta desde ahí.
            </p>
            <button className="route-panel-pick-btn" onClick={() => routeCourse && handleDirections(routeCourse)} type="button">
              Reintentar con mi ubicación
            </button>
          </div>
        )}
        {routeCourse && !routeLoading && route && (
          <RoutePanel
            course={routeCourse}
            distanciaM={route.distanciaM}
            pasos={route.pasos}
            tiempos={estimarTiempos(route.distanciaM)}
            onClose={closeRoutePanel}
          />
        )}
        <MapControls
          layerType={layerType}
          onToggleLayer={() => setLayerType((t) => t === 'map' ? 'satellite' : 'map')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((f) => !f)}
        />
        </div>
      {streetView && (
        <MapillaryViewer
          lat={streetView.lat}
          lng={streetView.lng}
          onClose={() => setStreetView(null)}
        />
      )}
      {showMapillaryModal && (
        <div className="mapillary-modal-overlay" onClick={() => setShowMapillaryModal(false)}>
          <div className="mapillary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mapillary-modal-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#581C87" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h3 className="mapillary-modal-title">Vista de calle</h3>
            <p className="mapillary-modal-text">
              Activa el modo para ver la cobertura de Mapillary en el mapa. Los puntos verdes muestran ubicaciones con imágenes de la calle.
            </p>
            <p className="mapillary-modal-warning">
              Este modo consume recursos del dispositivo. Se recomienda en computadoras o dispositivos modernos.
            </p>
            <button
              className="mapillary-modal-btn"
              onClick={() => {
                setShowMapillaryModal(false)
                const activating = !mapillaryMode
                setMapillaryMode(activating)
                if (activating) {
                  // Zoom out to a reasonable level for overview
                  setFlyTarget({ center: PUEBLA_CENTER, zoom: 12 })
                } else {
                  setStreetView(null)
                }
              }}
              type="button"
            >
              {mapillaryMode ? 'Salir del modo' : 'Activar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
