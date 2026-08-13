import BlurText from '../BlurText'

interface NotFoundPageProps {
  title?: string
  subtitle?: string
  description?: string
  showReload?: boolean
  onHome?: () => void
}

export default function NotFoundPage({
  title = '404',
  subtitle = 'Ups, esta página no existe',
  description = 'El camino que buscabas no está por acá, pero siempre podés volver al inicio.',
  showReload = false,
  onHome,
}: NotFoundPageProps) {
  const goHome = () => {
    if (onHome) {
      onHome()
      return
    }
    window.location.href = '/'
  }

  const reload = () => window.location.reload()

  return (
    <div className="notfound-page">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="notfound-wave-clip" clipPathUnits="objectBoundingBox">
            <path d="
              M0,1
              L1,1
              L1,0.18
              C0.93,0.18 0.89,0.01 0.82,0.01
              C0.75,0.01 0.71,0.16 0.64,0.16
              C0.57,0.16 0.53,0.02 0.46,0.02
              C0.39,0.02 0.35,0.17 0.28,0.17
              C0.21,0.17 0.17,0.03 0.10,0.03
              C0.05,0.03 0.02,0.15 0,0.15
              Z
            " />
          </clipPath>
        </defs>
      </svg>

      <div className="notfound-content">
        <span className="notfound-brand">Mujer-ES</span>
        <BlurText
          text={title}
          animateBy="letters"
          direction="top"
          delay={90}
          stepDuration={0.35}
          className="notfound-code"
          as="h1"
        />
        <p className="notfound-subtitle">{subtitle}</p>
        <p className="notfound-text">{description}</p>
        <div className="notfound-actions">
          {showReload && (
            <button className="notfound-btn notfound-btn-ghost" type="button" onClick={reload}>
              Reintentar
            </button>
          )}
          <button className="notfound-btn" type="button" onClick={goHome}>
            Volver al inicio
          </button>
        </div>
      </div>

      <div className="notfound-waves" />
    </div>
  )
}