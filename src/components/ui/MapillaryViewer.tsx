import { useEffect, useRef, useState } from 'react'
import { Viewer } from 'mapillary-js'
import 'mapillary-js/dist/mapillary.css'

const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN || ''

interface MapillaryViewerProps {
  lat: number
  lng: number
  onClose: () => void
}

export default function MapillaryViewer({ lat, lng, onClose }: MapillaryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!MAPILLARY_TOKEN) {
      setError('Token de Mapillary no configurado. Agregá VITE_MAPILLARY_TOKEN en tu archivo .env')
      setLoading(false)
      return
    }

    let viewer: Viewer | null = null
    let cancelled = false

    const initViewer = async () => {
      try {
        // Find nearest image to the coordinates
        const apiUrl = `https://graph.mapillary.com/images?lat=${lat}&lng=${lng}&radius=50&limit=1&access_token=${MAPILLARY_TOKEN}`
        const res = await fetch(apiUrl)
        const data = await res.json()

        if (cancelled) return

        if (!data.data || data.data.length === 0) {
          setError('No hay imagen street-level disponible para esta ubicación')
          setLoading(false)
          return
        }

        const imageId = data.data[0].id

        if (!containerRef.current || cancelled) return

        viewer = new Viewer({
          accessToken: MAPILLARY_TOKEN,
          container: containerRef.current,
          imageId,
        })

        viewerRef.current = viewer
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError('Error al cargar la imagen street-level')
          setLoading(false)
        }
      }
    }

    initViewer()

    return () => {
      cancelled = true
      if (viewer) {
        viewer.remove()
        viewerRef.current = null
      }
    }
  }, [lat, lng])

  return (
    <>
      <div className="mapillary-overlay" onClick={onClose} />
      <div className="mapillary-panel">
        <div className="mapillary-header">
          <span className="mapillary-title">Vista de calle</span>
          <button className="mapillary-close" onClick={onClose} type="button" aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="mapillary-body">
          {loading && (
            <div className="mapillary-loading">
              <div className="curso-detail-spinner" />
              <p>Cargando vista de calle...</p>
            </div>
          )}
          {error && (
            <div className="mapillary-error">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <p>{error}</p>
            </div>
          )}
          <div
            ref={containerRef}
            className={`mapillary-container ${loading || error ? 'mapillary-hidden' : ''}`}
          />
        </div>
      </div>
    </>
  )
}
