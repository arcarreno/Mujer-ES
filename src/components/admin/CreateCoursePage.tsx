import { useState, useEffect } from 'react'
import { MapContainer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sileo } from 'sileo'
import { createCourse, type Course } from '../../lib/queries'
import SubmitButton from '../ui/SubmitButton'
import { MapControls, MapTileLayer, PUEBLA_CENTER, PUEBLA_ZOOM, type LayerType } from '../ui/MapControls'

interface CreateCoursePageProps {
  onCreated: (course: Course) => void
  onBack: () => void
}

function LocationPicker({ position, onSelect }: {
  position: [number, number] | null
  onSelect: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng)
    },
  })

  return position ? (
    <Marker
      position={position}
      icon={L.divIcon({
        className: 'map-marker-pointer',
        html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#581C87"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
      })}
    />
  ) : null
}

export default function CreateCoursePage({ onCreated, onBack }: CreateCoursePageProps) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [modality, setModality] = useState<'virtual' | 'presencial'>('virtual')
  const [published, setPublished] = useState(true)
  const [maxEnrollments, setMaxEnrollments] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locationName, setLocationName] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number]>(PUEBLA_CENTER)
  const [layerType, setLayerType] = useState<LayerType>('map')
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {}
      )
    }
  }, [])

  const handleMapClick = (lat: number, lng: number) => {
    setLatitude(lat)
    setLongitude(lng)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      sileo.error({ title: 'Faltan datos', description: 'El título es obligatorio' })
      return
    }
    if (modality === 'presencial' && (latitude === null || longitude === null)) {
      sileo.error({ title: 'Faltan datos', description: 'Seleccioná la ubicación en el mapa' })
      return
    }
    setLoading(true)
    try {
      const course = await createCourse({
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        modality,
        published,
        max_enrollments: maxEnrollments ? parseInt(maxEnrollments) : null,
        latitude,
        longitude,
        location_name: locationName.trim() || null,
      })
      sileo.success({ title: 'Curso creado', description: `"${course.title}" fue creado exitosamente` })
      onCreated(course)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo crear el curso' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-course-page">
      <div className="create-course-page-header">
        <button onClick={onBack} className="volver-btn" type="button">
          <div className="volver-btn-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="20px" width="20px">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
            </svg>
          </div>
          <p className="volver-btn-text">Volver</p>
        </button>
        <h2 className="create-course-page-title">Crear curso</h2>
      </div>

      <form onSubmit={handleSubmit} className="create-course-page-form">
        <div className="login-field">
          <label htmlFor="course-title">Título *</label>
          <input
            id="course-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre del curso"
            maxLength={100}
          />
        </div>

        <div className="login-field">
          <label htmlFor="course-subtitle">Subtítulo</label>
          <input
            id="course-subtitle"
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Breve descripción del curso"
            maxLength={200}
          />
        </div>

        <div className="login-field">
          <label htmlFor="course-desc">Descripción</label>
          <textarea
            id="course-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles del curso, temario, requisitos..."
            rows={4}
            maxLength={2000}
          />
        </div>

        <div className="login-field">
          <label htmlFor="course-vacancies">Vacantes disponibles</label>
          <input
            id="course-vacancies"
            type="number"
            min="1"
            max="9999"
            value={maxEnrollments}
            onChange={(e) => setMaxEnrollments(e.target.value)}
            placeholder="Ej: 30 (dejar vacío = ilimitado)"
          />
        </div>

        <div className="login-field">
          <label>Modalidad</label>
          <div className="create-course-modality">
            <button
              type="button"
              className={`create-course-modality-btn ${modality === 'virtual' ? 'active' : ''}`}
              onClick={() => setModality('virtual')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" x2="16" y1="21" y2="21" />
                <line x1="12" x2="12" y1="17" y2="21" />
              </svg>
              Virtual
            </button>
            <button
              type="button"
              className={`create-course-modality-btn ${modality === 'presencial' ? 'active' : ''}`}
              onClick={() => setModality('presencial')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Presencial
            </button>
          </div>
        </div>

        {modality === 'presencial' && (
          <>
            <div className="login-field">
              <label htmlFor="location-name">Nombre del lugar</label>
              <input
                id="location-name"
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ej: Centro Cultural San Martín"
                maxLength={200}
              />
            </div>

            <div className="login-field">
              <label>Ubicación en el mapa *{latitude !== null && ` (${latitude.toFixed(4)}, ${longitude!.toFixed(4)})`}</label>
              <div className={`create-course-map ${isFullscreen ? 'create-course-map-fullscreen' : ''}`}>
                <MapContainer
                  key={`${layerType}-${isFullscreen}`}
                  center={mapCenter}
                  zoom={PUEBLA_ZOOM}
                  style={{ height: '100%', width: '100%', borderRadius: isFullscreen ? 0 : '0.5rem' }}
                >
                  <MapTileLayer layerType={layerType} />
                  <LocationPicker position={latitude !== null ? [latitude, longitude!] : null} onSelect={handleMapClick} />
                </MapContainer>
                <MapControls
                  layerType={layerType}
                  onToggleLayer={() => setLayerType((t) => t === 'map' ? 'satellite' : 'map')}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={() => setIsFullscreen((f) => !f)}
                />
              </div>
              <span className="create-course-map-hint">Hacé clic en el mapa para marcar la ubicación</span>
            </div>
          </>
        )}

        <div className="login-field">
          <label>Publicación</label>
          <div className="create-course-modality">
            <button
              type="button"
              className={`create-course-modality-btn ${published ? 'active' : ''}`}
              onClick={() => setPublished(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Publicado
            </button>
            <button
              type="button"
              className={`create-course-modality-btn ${!published ? 'active' : ''}`}
              onClick={() => setPublished(false)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              Borrador
            </button>
          </div>
        </div>

        <div className="create-course-page-actions">
          <button type="button" className="login-link login-link-btn" onClick={onBack}>
            Cancelar
          </button>
          <SubmitButton loading={loading}>Crear curso</SubmitButton>
        </div>
      </form>
    </div>
  )
}
