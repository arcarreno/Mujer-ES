import { useRef, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import lottie from 'lottie-web'
import animationData from '../../assets/lottie/aprobado.json'

interface SuccessAnimationProps {
  message: string
  onDone: () => void
}

export default function SuccessAnimation({ message, onDone }: SuccessAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showMessage, setShowMessage] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const anim = lottie.loadAnimation({
      container: el,
      animationData,
      loop: false,
      autoplay: true,
    })

    anim.addEventListener('complete', () => {
      setShowMessage(true)
      setTimeout(() => onDone(), 1200)
    })

    return () => anim.destroy()
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(255,255,255,0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '200px',
          height: '200px',
        }}
      />

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={showMessage ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4 }}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.1rem',
          color: '#065f46',
          margin: 0,
          textAlign: 'center',
          padding: '0 var(--space-4)',
        }}
      >
        {message}
      </motion.p>
    </motion.div>
  )
}
