const cursos = [
  {
    id: 1,
    title: 'Identificar la violencia',
    description: 'Aprende a reconocer los diferentes tipos de violencia de género y sus señales de alerta.',
    duration: '45 min',
    level: 'Introductorio',
  },
  {
    id: 2,
    title: 'Leyes y derechos',
    description: 'Conoce el marco legal que protege tus derechos y los recursos disponibles para ti.',
    duration: '1h 20min',
    level: 'Intermedio',
  },
  {
    id: 3,
    title: 'Primeros auxilios emocionales',
    description: 'Técnicas de apoyo psicológico para ti o alguien que esté pasando por una situación difícil.',
    duration: '1h',
    level: 'Todos los niveles',
  },
  {
    id: 4,
    title: 'Redes de apoyo',
    description: 'Cómo construir y mantener una red de contención segura y efectiva.',
    duration: '30 min',
    level: 'Introductorio',
  },
]

export default function CursosPage() {
  return (
    <div className="cursos-page">
      <div className="cursos-header">
        <h2 className="cursos-title">Cursos</h2>
        <p className="cursos-subtitle">Aprende a tu ritmo, en cualquier momento</p>
      </div>

      <div className="cursos-list">
        {cursos.map((curso, i) => (
          <article
            key={curso.id}
            className="curso-card"
            style={{ animationDelay: `${i * 80}ms` }}
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
                <span className="curso-meta-pill">{curso.duration}</span>
                <span className="curso-meta-pill">{curso.level}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
