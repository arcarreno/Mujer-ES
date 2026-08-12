import type { Course } from '../../lib/queries'
import { formatoDistancia, type PasoRuta, type TiemposEstimados } from '../../lib/routing'

interface RoutePanelProps {
  course: Course
  distanciaM: number
  pasos: PasoRuta[]
  tiempos: TiemposEstimados
  onClose: () => void
}

function CarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  )
}

function BikeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </svg>
  )
}

function WalkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" />
      <path d="m9 20 3-6 3 6" />
      <path d="m6 8 6 2 6-2" />
      <path d="M12 10v4" />
    </svg>
  )
}

export default function RoutePanel({ course, distanciaM, pasos, tiempos, onClose }: RoutePanelProps) {
  return (
    <aside className="route-panel" aria-label="Indicaciones para llegar">
      {/* SVG clip-path for the wavy bottom edge of the header (same style as login) */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="route-wave-clip" clipPathUnits="objectBoundingBox">
            <path d="
              M0,0
              L1,0
              L1,0.8
              C0.92,0.8 0.84,0.96 0.74,0.96
              C0.64,0.96 0.58,0.78 0.5,0.78
              C0.42,0.78 0.36,0.94 0.26,0.94
              C0.16,0.94 0.08,0.82 0,0.82
              Z
            " />
          </clipPath>
        </defs>
      </svg>
      <div className="route-panel-header">
        <h3 className="route-panel-title">Cómo llegar</h3>
        <button className="route-panel-close" onClick={onClose} type="button" aria-label="Cerrar indicaciones">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="route-panel-destino">
        <span className="route-panel-destino-label">Destino</span>
        <strong className="route-panel-destino-nombre">{course.title}</strong>
        {course.location_name && <span className="route-panel-destino-direccion">{course.location_name}</span>}
      </div>

      <div className="route-panel-resumen">
        <div className="route-panel-distancia">
          <span className="route-panel-distancia-valor">{formatoDistancia(distanciaM)}</span>
          <span className="route-panel-distancia-label">distancia estimada</span>
        </div>
        <div className="route-panel-tiempos">
          <div className="route-panel-tiempo">
            <span className="route-panel-tiempo-icon route-panel-tiempo-icon-auto"><CarIcon /></span>
            <div>
              <span className="route-panel-tiempo-valor">{tiempos.auto}</span>
              <span className="route-panel-tiempo-label">en auto</span>
            </div>
          </div>
          <div className="route-panel-tiempo">
            <span className="route-panel-tiempo-icon"><BikeIcon /></span>
            <div>
              <span className="route-panel-tiempo-valor">{tiempos.bicicleta}</span>
              <span className="route-panel-tiempo-label">en bici</span>
            </div>
          </div>
          <div className="route-panel-tiempo">
            <span className="route-panel-tiempo-icon"><WalkIcon /></span>
            <div>
              <span className="route-panel-tiempo-valor">{tiempos.caminando}</span>
              <span className="route-panel-tiempo-label">caminando</span>
            </div>
          </div>
        </div>
      </div>

      <div className="route-panel-pasos">
        <h4 className="route-panel-pasos-title">Pasos a seguir</h4>
        {pasos.length === 0 ? (
          <p className="route-panel-pasos-vacio">Llegaste al destino</p>
        ) : (
          <ol className="route-panel-pasos-lista">
            {pasos.map((paso, i) => (
              <li key={i} className="route-panel-paso">
                <span className="route-panel-paso-numero">{i + 1}</span>
                <div className="route-panel-paso-cuerpo">
                  <span className="route-panel-paso-instruccion">{paso.instruccion}</span>
                  <span className="route-panel-paso-distancia">{formatoDistancia(paso.distanciaM)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="route-panel-nota">Ruta estimada sobre la red de calles de OpenStreetMap. El tiempo varía según el tráfico.</p>
    </aside>
  )
}