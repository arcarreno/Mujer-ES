import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Carousel from './components/Carousel'
import BlurText from './components/BlurText'
import Login from './components/Login'

const images = Array.from({ length: 11 }, (_, i) => ({
  src: `/images/image ${i + 1}.jpeg`,
  alt: `Image ${i + 1}`,
  href: '#',
}))

function App() {
  const [showLogin, setShowLogin] = useState(false)
  const [phase, setPhase] = useState<'intro' | 'zooming' | 'login'>('intro')

  const handleComenzar = () => {
    setPhase('zooming')
    setTimeout(() => {
      setPhase('login')
      setShowLogin(true)
    }, 800)
  }

  const handleBack = () => {
    setShowLogin(false)
    setPhase('intro')
  }

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden" style={{ perspective: '1200px' }}>
      <AnimatePresence>
        {phase === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.5, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 z-10"
          >
            <div className="absolute left-0 w-full text-center z-10 max-sm:top-6" style={{ top: '42px' }}>
              <div className="inline-flex items-baseline">
                <BlurText
                  text="Mujer"
                  animateBy="letters"
                  direction="top"
                  delay={150}
                  stepDuration={0.4}
                  className="site-title"
                />
                <BlurText
                  text="-ES"
                  animateBy="letters"
                  direction="top"
                  delay={150}
                  stepDuration={0.4}
                  className="site-title-italic"
                />
              </div>
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                onClick={handleComenzar}
                className="comenzar-btn"
              >
                Comenzar
              </motion.button>
            </div>
            <div className="absolute inset-0 flex items-center justify-center z-0">
              <Carousel images={images} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'zooming' && (
          <motion.div
            key="zoom"
            initial={{ scale: 0.3, opacity: 0, rotateY: 180 }}
            animate={{ scale: 1, opacity: 1, rotateY: 360 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
            className="absolute inset-0 flex items-center justify-center z-20"
          >
            <div className="login-placeholder" />
          </motion.div>
        )}
      </AnimatePresence>

      {showLogin && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Login onBack={handleBack} />
        </motion.div>
      )}
    </div>
  )
}

export default App
