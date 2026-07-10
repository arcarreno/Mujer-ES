import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import lottie from 'lottie-web'
import animationData from '../../assets/lottie/welcome.json'

interface WelcomeOverlayProps {
  onDone: () => void
  maxFrames?: number
}

export default function WelcomeOverlay({ onDone, maxFrames = 246 }: WelcomeOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isSliding, setIsSliding] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const anim = lottie.loadAnimation({
      container: el,
      animationData,
      loop: false,
      autoplay: false,
    })

    anim.addEventListener('DOMLoaded', () => {
      const end = Math.min(maxFrames, anim.totalFrames)
      anim.playSegments([0, end], true)
    })

    anim.addEventListener('complete', () => {
      setIsSliding(true)
    })

    return () => {
      anim.destroy()
    }
  }, [maxFrames])

  return (
    <motion.div
      initial={{ y: 0 }}
      animate={isSliding ? { y: '100%' } : { y: 0 }}
      transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={() => { if (isSliding) onDone() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'var(--alabaster, #F2F0EB)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '80vw',
          maxWidth: '428px',
        }}
      />
    </motion.div>
  )
}
