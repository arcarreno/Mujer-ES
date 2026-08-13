import { motion } from 'motion/react'

interface ConocenosPageProps {
  onBack: () => void
}

const sections = [
  {
    title: '¿Qué es Mujer-ES?',
    body:
      'Mujer-ES es una plataforma de acompañamiento para mujeres que están atravesando situaciones de violencia de género. Un espacio cerrado y seguro donde cada mujer encuentra cursos de concientización, chats de apoyo con otras mujeres y profesionales, y herramientas concretas para dar el primer paso.',
  },
  {
    title: 'Quiénes participan',
    body:
      'Somos mujeres voluntarias, psicólogas, trabajadoras sociales y talleristas que donan su tiempo para acompañar a otras mujeres. Cada persona que participa lo hace desde el respeto, la escucha y la confidencialidad absoluta: lo que se vive dentro de Mujer-ES, se queda en Mujer-ES.',
  },
  {
    title: 'Nuestra historia',
    body:
      'Mujer-ES nació de una conversación entre amigas que habían vivido en primera persona el silencio que rodea a la violencia de género. Descubrimos que muchas veces no se habla porque da miedo, porque hay vergüenza o porque simplemente no sabemos a quién recurrir. Así empezamos a construir este lugar: una red que sostiene, informa y acompaña, paso a paso, desde el primer mensaje hasta la independencia.',
  },
  {
    title: 'Por qué estamos acá',
    body:
      'Porque ninguna mujer debería sentirse sola. Estamos acá para que cada mujer sepa que merece vivir sin miedo, que sus derechos existen y que siempre hay una mano tendida. No juzgamos, no preguntamos el porqué: caminamos al lado, acompañamos la decisión que cada mujer tome, y celebramos cada paso que da.',
  },
]

export default function ConocenosPage({ onBack }: ConocenosPageProps) {
  return (
    <div className="conocenos-page">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="conocenos-wave-clip" clipPathUnits="objectBoundingBox">
            <path d="
              M0,0
              L1,0
              L1,0.82
              C0.93,0.82 0.89,0.99 0.82,0.99
              C0.75,0.99 0.71,0.84 0.64,0.84
              C0.57,0.84 0.53,0.98 0.46,0.98
              C0.39,0.98 0.35,0.83 0.28,0.83
              C0.21,0.83 0.17,0.97 0.10,0.97
              C0.05,0.97 0.02,0.85 0,0.85
              Z
            " />
          </clipPath>
        </defs>
      </svg>

      <div className="conocenos-header">
        <button className="conocenos-back" type="button" onClick={onBack} aria-label="Volver al inicio">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
        </button>
        <div className="conocenos-header-brand">
          <span className="conocenos-header-greeting">Mujer-ES</span>
          <h1 className="conocenos-header-title">Conócenos</h1>
        </div>
      </div>

      <main className="conocenos-main">
        <motion.p
          className="conocenos-tagline"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Somos un espacio seguro de apoyo, información y acompañamiento para mujeres.
        </motion.p>

        {sections.map((section, i) => (
          <motion.section
            key={section.title}
            className="conocenos-section"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.12 }}
          >
            <h2 className="conocenos-section-title">{section.title}</h2>
            <p className="conocenos-section-body">{section.body}</p>
          </motion.section>
        ))}

        <motion.div
          className="conocenos-footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
        >
          <p className="conocenos-footer-text">
            Si estás acá, ya diste el paso más importante: pedir ayuda. No estás sola.
          </p>
          <button className="conocenos-btn" type="button" onClick={onBack}>
            Volver al inicio
          </button>
        </motion.div>
      </main>
    </div>
  )
}