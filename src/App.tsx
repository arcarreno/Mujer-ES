import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Toaster, sileo } from 'sileo'
import { supabase } from './lib/supabase'
import {
  getProfile,
  hasCompletedInitialForm,
  isUserAdmin,
  type Profile,
} from './lib/queries'
import useNetworkStatus from './hooks/useNetworkStatus'
import Carousel from './components/Carousel'
import BlurText from './components/BlurText'
import Login from './components/Login'
import LoadingFallback from './components/ui/LoadingFallback'
import ErrorBoundary from './components/ui/ErrorBoundary'
import WelcomeOverlay from './components/ui/WelcomeOverlay'

// Lazy load heavy layouts (admin, home)
const WelcomeForm = lazy(() => import('./components/form/WelcomeForm'))
const HomeLayout = lazy(() => import('./components/home/HomeLayout'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))

const images = Array.from({ length: 11 }, (_, i) => ({
  src: `/images/image ${i + 1}.webp`,
  alt: `Image ${i + 1}`,
  href: '#',
}))

type SessionUser = { id: string; email?: string }
type AppPhase = 'loading' | 'landing' | 'welcome-form' | 'home'

interface SessionData {
  profile: Profile | null
  isAdmin: boolean
}

function App() {
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [sessionData, setSessionData] = useState<SessionData>({
    profile: null,
    isAdmin: false,
  })
  const [formCheckKey, setFormCheckKey] = useState(0)
  const [showLandingOverlay, setShowLandingOverlay] = useState(true)
  const isOnline = useNetworkStatus()
  const wasOffline = useRef(!navigator.onLine)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isOnline && wasOffline.current) {
      sileo.success({
        title: 'Conexión restaurada',
        description: 'Ya tenés internet de vuelta.',
      })
    }
    if (!isOnline) {
      wasOffline.current = true
      sileo.error({
        title: 'Sin conexión',
        description: 'No hay internet. Verificá tu red y volvé a intentar.',
      })
    }
  }, [isOnline])

  const handleSession = async (u: SessionUser | null) => {
    setUser(u)
    if (!u) {
      setSessionData({ profile: null, isAdmin: false })
      setShowLandingOverlay(true)
      setPhase('landing')
      return
    }
    const [p, completed, admin] = await Promise.all([
      getProfile(u.id),
      hasCompletedInitialForm(u.id),
      isUserAdmin(u.id),
    ])

    setSessionData({ profile: p, isAdmin: admin })

    if (p?.blocked_until && new Date(p.blocked_until) > new Date()) {
      const until = new Date(p.blocked_until).toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      sileo.error({
        title: 'Cuenta bloqueada',
        description: `Tu cuenta está bloqueada hasta el ${until}. Esperá a que se cumpla el tiempo para volver a entrar.`,
      })
      await supabase.auth.signOut()
      setUser(null)
      setSessionData({ profile: null, isAdmin: false })
      setShowLandingOverlay(true)
      setPhase('landing')
      return
    }

    if (admin || completed) {
      setPhase('home')
    } else {
      setPhase('welcome-form')
    }
  }

  const handleFormComplete = async () => {
    if (!user) return
    setFormCheckKey((k) => k + 1)
    const completed = await hasCompletedInitialForm(user.id)
    if (completed) {
      setPhase('home')
    }
  }

  const handleLogout = () => {
    setUser(null)
    setSessionData({ profile: null, isAdmin: false })
    setShowLandingOverlay(true)
    setPhase('landing')
  }

  return (
    <div className="relative w-full bg-white overflow-hidden" style={{ height: '100dvh' }}>
      <div style={{ perspective: '1200px', width: '100%', height: '100%' }}>
        <AnimatePresence mode="wait">
          {phase === 'landing' && (
            <>
              <motion.div
                key="landing"
                initial={{ opacity: 0, scale: 0.5, rotateX: -25 }}
                animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                exit={{ opacity: 0, scale: 1.4, filter: 'blur(8px)' }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0 z-10"
              >
                <div className="site-header absolute left-0 w-full text-center z-10">
                  <h1 className="inline-flex items-baseline m-0">
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
                  </h1>
                  <motion.button
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.5 }}
                    onClick={() => setPhase('welcome-form')}
                    className="comenzar-btn"
                  >
                    Comenzar
                  </motion.button>
                </div>
                <div
                  className="absolute inset-0 flex items-center justify-center z-0"
                  style={{
                    opacity: showLandingOverlay ? 0 : 1,
                    transform: showLandingOverlay ? 'translateY(40px)' : 'translateY(0)',
                    transition: 'opacity 1.2s ease-out, transform 1.2s ease-out',
                  }}
                >
                  <Carousel images={images} />
                </div>
              </motion.div>

              {showLandingOverlay && (
                <WelcomeOverlay onDone={() => setShowLandingOverlay(false)} />
              )}
            </>
          )}

          {phase === 'welcome-form' && !user && (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute inset-0 flex items-center justify-center z-20"
            >
              <Login onBack={() => setPhase('landing')} />
            </motion.div>
          )}

          {phase === 'welcome-form' && user && sessionData.profile && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <WelcomeForm
                  key={`welcome-form-${formCheckKey}`}
                  userId={user.id}
                  username={sessionData.profile.username}
                  onComplete={handleFormComplete}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {phase === 'home' && user && sessionData.profile && (
            <motion.div
              key="home"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-20"
            >
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  {sessionData.isAdmin ? (
                    <AdminLayout username={sessionData.profile.username} onLogout={handleLogout} />
                  ) : (
                    <HomeLayout username={sessionData.profile.username} onLogout={handleLogout} />
                  )}
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Toaster
        position="top-center"
        offset={2}
        options={{
          fill: '#000000',
          roundness: 12,
          autopilot: false,
          styles: {
            title: 'sileo-title-light',
            description: 'sileo-description-light',
            badge: 'sileo-badge-light',
            button: 'sileo-button-light',
          },
        }}
      />
    </div>
  )
}

export default App
