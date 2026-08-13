import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Toaster, sileo } from 'sileo'
import { supabase } from './lib/supabase'
import {
  getProfile,
  hasCompletedInitialForm,
  isUserAdmin,
  checkFirstLogin,
  markIntentionalSignOut,
  consumeIntentionalSignOut,
  type Profile,
} from './lib/queries'
import useNetworkStatus from './hooks/useNetworkStatus'
import Carousel from './components/Carousel'
import BlurText from './components/BlurText'
import Login from './components/Login'
import LoadingFallback from './components/ui/LoadingFallback'
import ErrorBoundary from './components/ui/ErrorBoundary'
import WelcomeOverlay from './components/ui/WelcomeOverlay'
import NotFoundPage from './components/ui/NotFoundPage'
import SetPasswordForm from './components/form/SetPasswordForm'

// Lazy load heavy layouts (admin, home)
const WelcomeForm = lazy(() => import('./components/form/WelcomeForm'))
const HomeLayout = lazy(() => import('./components/home/HomeLayout'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const ConocenosExperience = lazy(() => import('./components/landing/ConocenosExperience'))

const images = Array.from({ length: 11 }, (_, i) => ({
  src: `/images/image ${i + 1}.webp`,
  alt: `Image ${i + 1}`,
  href: '#',
}))

type SessionUser = { id: string; email?: string }
type AppPhase = 'loading' | 'landing' | 'welcome-form' | 'first-login' | 'home'

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
  const [conocenosOpen, setConocenosOpen] = useState(false)
  const isOnline = useNetworkStatus()
  const wasOffline = useRef(!navigator.onLine)
  const [badRoute, setBadRoute] = useState(() => window.location.pathname !== '/')

  useEffect(() => {
    const checkRoute = () => setBadRoute(window.location.pathname !== '/')
    window.addEventListener('popstate', checkRoute)
    return () => window.removeEventListener('popstate', checkRoute)
  }, [])

  useEffect(() => {
    // Cargar sesión persistida al montar (además del evento INITIAL_SESSION)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Registramos TODOS los eventos de auth para poder diagnosticar
      // expiraciones de sesión (Refresh Token Not Found / rotación multi-pestaña)
      console.log(`[Auth] Event: ${event}`, session?.user?.id ?? '(sin usuario)')
      if (event === 'SIGNED_OUT') {
        void handleUnexpectedSignOut()
        return
      }
      if (session?.user) {
        // Un login exitoso descarta cualquier sign-out pendiente de marcar
        consumeIntentionalSignOut()
      }
      handleSession(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const userRef = useRef<SessionUser | null>(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  const clearStoredAuthToken = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key)
        }
      }
    } catch {
      // Storage puede no estar disponible (modo privado)
    }
  }

  /** SIGNED_OUT sin pedido del usuario: intentar recuperar la sesión con un
   * refresh; si el servidor la revocó (Refresh Token Not Found), limpiar el
   * token local y volver al landing para evitar el loop de cierre/re-apertura. */
  const handleUnexpectedSignOut = async () => {
    if (consumeIntentionalSignOut()) {
      console.log('[Auth] Sign-out explícito del usuario, ignorando SIGNED_OUT')
      handleSession(null)
      return
    }
    console.warn('[Auth] SIGNED_OUT inesperado — intentando recuperar sesión...')
    const { data, error } = await supabase.auth.refreshSession()
    if (data.session?.user) {
      console.log('[Auth] Sesión recuperada vía refreshSession()')
      handleSession(data.session.user)
      return
    }
    console.error('[Auth] Recuperación de sesión fallida:', error?.message ?? 'sin sesión')
    clearStoredAuthToken()
    handleSession(null)
    if (userRef.current) {
      sileo.error({
        title: 'Tu sesión expiró',
        description: 'Hubo un problema con tu sesión. Volvé a iniciar sesión para continuar.',
      })
    }
  }

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
    const [p, completed, admin, firstLogin] = await Promise.all([
      getProfile(u.id),
      hasCompletedInitialForm(u.id),
      isUserAdmin(u.id),
      checkFirstLogin(u.id),
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
      markIntentionalSignOut()
      await supabase.auth.signOut()
      setUser(null)
      setSessionData({ profile: null, isAdmin: false })
      setShowLandingOverlay(true)
      setPhase('landing')
      return
    }

    if (admin && !firstLogin) {
      setPhase('home')
    } else if (admin && firstLogin) {
      setPhase('first-login')
    } else if (completed && !firstLogin) {
      setPhase('home')
    } else if (firstLogin) {
      setPhase('first-login')
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

  const handlePasswordSet = async () => {
    if (!user) return
    const [p, completed, firstLogin] = await Promise.all([
      getProfile(user.id),
      hasCompletedInitialForm(user.id),
      checkFirstLogin(user.id),
    ])
    if (p) setSessionData((s) => ({ ...s, profile: p }))
    if (p?.blocked_until && new Date(p.blocked_until) > new Date()) {
      markIntentionalSignOut()
      await supabase.auth.signOut()
      setUser(null)
      setSessionData({ profile: null, isAdmin: false })
      setShowLandingOverlay(true)
      setPhase('landing')
      return
    }
    if (firstLogin) {
      sileo.warning({
        title: 'No se pudo actualizar',
        description: 'Volvé a intentar o cerrá sesión y entrá de nuevo.',
      })
      setPhase('first-login')
      return
    }
    setPhase(completed ? 'home' : 'welcome-form')
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
        {badRoute ? (
          <NotFoundPage
            onHome={() => {
              window.location.href = '/'
            }}
          />
        ) : (
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
                {!showLandingOverlay && (
                  <div
                    className="site-header absolute left-0 w-full text-center z-10"
                    onClick={() => setConocenosOpen(true)}
                    title="Conócenos"
                  >
                    <h1 className="inline-flex items-baseline m-0 site-title-clickable">
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
                      onClick={(e) => {
                        e.stopPropagation()
                        setPhase('welcome-form')
                      }}
                      className="comenzar-btn"
                    >
                      Comenzar
                    </motion.button>
                  </div>
                )}
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
              <Login
                onBack={() => {
                  // Volver al landing siempre reproduce la animación Lottie de
                  // bienvenida; el carrusel ya está renderizado debajo.
                  setShowLandingOverlay(true)
                  setPhase('landing')
                }}
              />
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

          {phase === 'first-login' && user && (
            <motion.div
              key="first-login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center z-20"
            >
              <SetPasswordForm userId={user.id} onComplete={handlePasswordSet} />
            </motion.div>
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
        )}
      </div>

      {conocenosOpen && (
        <ErrorBoundary>
          <Suspense
            fallback={
              <div
                className="conocenos-fallback"
                style={{ position: 'fixed', inset: 0, zIndex: 800, background: '#060609' }}
              />
            }
          >
            <ConocenosExperience onClose={() => setConocenosOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      )}

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
