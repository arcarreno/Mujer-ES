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

  const handleComenzar = () => {
    setShowLogin(true)
  }

  const handleBack = () => {
    setShowLogin(false)
  }

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden" style={{ perspective: '1200px' }}>
      <AnimatePresence mode="wait">
        {!showLogin && (
          <motion.div
            key="intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.4, filter: 'blur(8px)' }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
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
                initial={{ opacity: 0, y: 15 }}
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

      <AnimatePresence mode="wait">
        {showLogin && (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.5, rotateX: 25 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="absolute inset-0 flex items-center justify-center z-20"
          >
            <Login onBack={handleBack} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
