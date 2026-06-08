import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sileo } from 'sileo'
import { listPublishedCourses, type Course } from '../../lib/queries'

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
  const [mapCenter] = useState<[number, number]>([-34.6037, -58.3816])

  useEffect(() => {
    listPublishedCourses()
      .then((data) => setCourses(data.filter((c) => c.latitude && c.longitude)))
      .catch(() => sileo.error({ title: 'Error', description: 'No se pudieron cargar los cursos' }))
      .finally(() => setLoading(false))
  }, [])

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
    <div className="map-page">
      <div className="map-page-header">
        <h2 className="cursos-title">Mapa de cursos</h2>
        <p className="cursos-subtitle">{courses.length} curso{courses.length !== 1 ? 's' : ''} presencial{courses.length !== 1 ? 'es' : ''}</p>
      </div>
      <div className="map-page-container">
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
