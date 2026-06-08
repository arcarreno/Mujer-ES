import { TileLayer } from 'react-leaflet'

const PUEBLA_CENTER: [number, number] = [19.044348, -98.198483]
const PUEBLA_ZOOM = 12

const LAYERS = {
  map: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.arcgis.com/">Esri</a>',
  },
} as const

type LayerType = keyof typeof LAYERS

export { PUEBLA_CENTER, PUEBLA_ZOOM, LAYERS }
export type { LayerType }

interface MapControlsProps {
  layerType: LayerType
  onToggleLayer: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export function MapControls({ layerType, onToggleLayer, isFullscreen, onToggleFullscreen }: MapControlsProps) {
  return (
    <div className="map-controls">
      <button
        className="map-control-btn"
        onClick={onToggleLayer}
        type="button"
        title={layerType === 'map' ? 'Vista satelital' : 'Vista de mapa'}
      >
        {layerType === 'map' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
        )}
      </button>
      <button
        className="map-control-btn"
        onClick={onToggleFullscreen}
        type="button"
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {isFullscreen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function MapTileLayer({ layerType }: { layerType: LayerType }) {
  const layer = LAYERS[layerType]
  return (
    <TileLayer
      key={layerType}
      attribution={layer.attribution}
      url={layer.url}
    />
  )
}
