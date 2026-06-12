import { useState, useEffect, useCallback } from 'react'

interface ImageCarouselProps {
  images: string[]
  autoPlayMs?: number
  className?: string
}

export default function ImageCarousel({ images, autoPlayMs = 7000, className = '' }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % images.length)
  }, [images.length])

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  // Auto-play
  useEffect(() => {
    if (images.length <= 1 || paused) return
    const timer = setInterval(next, autoPlayMs)
    return () => clearInterval(timer)
  }, [next, paused, images.length, autoPlayMs])

  if (images.length === 0) return null
  if (images.length === 1) {
    return (
      <div className={`carousel-single ${className}`}>
        <img src={images[0]} alt="" className="carousel-single-img" />
      </div>
    )
  }

  // Get visible cards: current in front, others behind
  const getVisibleCards = () => {
    const cards: { src: string; index: number; offset: number }[] = []
    const total = images.length

    // Current card (front)
    cards.push({ src: images[current], index: current, offset: 0 })

    // Show up to 2 cards behind on each side
    for (let i = 1; i <= Math.min(2, total - 1); i++) {
      const nextIdx = (current + i) % total
      cards.push({ src: images[nextIdx], index: nextIdx, offset: i })
    }

    return cards
  }

  const visibleCards = getVisibleCards()

  return (
    <div
      className={`carousel-stacked ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="carousel-stacked-viewport">
        {visibleCards.map((card) => (
          <div
            key={card.index}
            className={`carousel-stacked-card ${card.offset === 0 ? 'carousel-stacked-card-active' : ''}`}
            style={{
              zIndex: 10 - card.offset,
              transform: `translateY(${card.offset * 8}px) scale(${1 - card.offset * 0.04})`,
              opacity: card.offset === 0 ? 1 : 0.7 - card.offset * 0.15,
            }}
            onClick={card.offset === 0 ? undefined : next}
          >
            <img src={card.src} alt="" className="carousel-stacked-img" />
          </div>
        ))}
      </div>

      <div className="carousel-stacked-controls">
        <button className="carousel-btn carousel-btn-prev" onClick={prev} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="carousel-stacked-counter">{current + 1} / {images.length}</span>
        <button className="carousel-btn carousel-btn-next" onClick={next} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
