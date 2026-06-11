import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const phrases = [
  { title: "No es amor, es control", text: "Cuando algo duele, no es amor. El amor debería ser un lugar seguro, donde cada uno pueda ser libre y feliz. Si no lo es, entonces no es amor." },
  { title: "El silencio también es violencia", text: "A veces pensamos que, si no decimos nada, no estamos contribuyendo al problema, pero el silencio también ayuda a que la violencia siga existiendo. ¡Las palabras son el primer paso para luchar contra la violencia de género!" },
  { title: "Ninguna mujer está sola, somos muchas luchando por la justicia", text: "Este mensaje es un recordatorio de que no tienes que enfrentar la violencia sola. Somos muchas las que estamos luchando para acabar con ella. ¡Juntas somos más fuertes! 💜" },
  { title: "La igualdad es el primer paso para erradicar la violencia", text: "Si realmente queremos que la violencia de género desaparezca, necesitamos empezar por construir una sociedad en la que todos tengamos las mismas oportunidades y derechos." },
  { title: "Cuando una mujer denuncia, una sociedad responde", text: "La denuncia es vital, pero la respuesta también lo es. Todos y todas tenemos que poner nuestro granito de arena para erradicar la violencia." },
  { title: "Si no somos feministas, entonces ¿qué somos?", text: "«Si no somos feministas, entonces ¿qué somos?» — Emma Watson. Nos recuerda que la lucha por la igualdad es de todos y todas. No se trata de un género o un grupo, se trata de ser humanos. Y ser feminista es ser parte del cambio." },
  { title: "El poder no está en las manos de quienes dan órdenes", text: "«El poder no está en las manos de quienes dan órdenes, sino en las de quienes cuidan, educan y transforman el mundo» — Malala Yousafzai. Nos habla del verdadero poder: el que reside en las mujeres, las cuidadoras. Es un poder silencioso, pero fundamental." },
  { title: "Una mujer que lucha por su libertad defiende el futuro de todas", text: "«Una mujer que lucha por su libertad es una mujer que defiende el futuro de todas» — Audre Lorde. La lucha de una mujer no es solo personal, es colectiva. Cada paso hacia la igualdad beneficia a toda la sociedad." },
  { title: "No hay nada más peligroso que una mujer que se ha levantado", text: "«No hay nada más peligroso que una mujer que se ha levantado» — Maya Angelou. El coraje de una mujer que decide alzar la voz puede cambiar el rumbo de su vida y el de muchas otras. No subestimes la fuerza de una mujer decidida." },
  { title: "La violencia nunca es un acto de amor", text: "«La violencia nunca es un acto de amor, es una manifestación de control y poder» — Bell Hooks. Si el amor duele o humilla, no es amor. Es manipulación. La verdadera esencia del amor es el respeto y la libertad." },
  { title: "Juntas somos invencibles", text: "Cada mujer que alza su voz abre camino para las que vienen detrás. No estamos solas, nunca lo estuvimos. La sororidad es nuestra fuerza más grande." },
]

interface CarouselImage {
  src: string
  alt: string
  href?: string
}

interface CarouselProps {
  images: CarouselImage[]
  animationDuration?: number
}

interface ModalState {
  index: number
  startX: number
  startY: number
}

export default function Carousel({ images, animationDuration = 25 }: CarouselProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  const cardRefs = useRef<(HTMLLIElement | null)[]>([])

  const handleMouseEnter = useCallback(() => {
    if (modal === null) {
      setIsHovering(true)
      setIsPaused(true)
    }
  }, [modal])

  const handleMouseLeave = useCallback(() => {
    if (modal === null) {
      setIsHovering(false)
      setIsPaused(false)
    }
  }, [modal])

  const handleCardClick = useCallback((index: number) => {
    if (modal?.index === index) {
      setModal(null)
      setIsHovering(false)
      setIsPaused(false)
      return
    }

    const el = cardRefs.current[index]
    if (!el) return

    const rect = el.getBoundingClientRect()
    const cardCenterX = rect.left + rect.width / 2
    const cardCenterY = rect.top + rect.height / 2

    setIsHovering(true)
    setIsPaused(true)
    setModal({ index, startX: cardCenterX, startY: cardCenterY })
  }, [modal])

  const handleCloseModal = useCallback(() => {
    setModal(null)
    setIsHovering(false)
    setIsPaused(false)
  }, [])

  // Escape key to close modal
  useEffect(() => {
    if (!modal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modal, handleCloseModal])

  const modalImage = modal !== null ? images[modal.index] : null
  const modalPhrase = modal !== null ? phrases[modal.index] : null

  return (
    <div
      className="carousel"
      style={{ '--carousel-animation-duration': `${animationDuration}s` } as React.CSSProperties}
    >
      <div className="carousel-rotation-wrapper">
        <ul
          className={`carousel-item-wrapper${isHovering ? ' hovering' : ''}${isPaused ? ' paused' : ''}`}
          style={{ '--_num-elements': images.length } as React.CSSProperties}
        >
          {images.map((image, i) => (
            <li
              key={i}
              ref={(el) => { cardRefs.current[i] = el }}
              className={`carousel-item${modal?.index === i ? ' is-hidden' : ''}`}
              style={{
                '--_index': i + 1,
                '--_image-url': `url('${image.src}')`,
              } as React.CSSProperties}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleCardClick(i)}
            >
              <div className="carousel-card">
                <div
                  className="card-front"
                  style={{ backgroundImage: `url('${image.src}')` }}
                />
                <div className="card-back">
                  <p className="card-back-title">{phrases[i]?.title}</p>
                  <p className="card-back-text">{phrases[i]?.text}</p>
                </div>
              </div>
            </li>
          ))}

          <li className="carousel-ground" />
        </ul>
      </div>

      {modal !== null && modalImage && modalPhrase && createPortal(
        <>
          <div className="carousel-modal-overlay" onClick={handleCloseModal} />
          <div
            className="carousel-modal-card is-animating"
            role="dialog"
            aria-modal="true"
            aria-label={modalPhrase.title}
            style={{
              left: `${modal.startX}px`,
              top: `${modal.startY}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-card-inner">
              <div
                className="card-front"
                style={{ backgroundImage: `url('${modalImage.src}')` }}
              />
              <div className="card-back">
                <p className="card-back-title">{modalPhrase.title}</p>
                <p className="card-back-text">{modalPhrase.text}</p>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
