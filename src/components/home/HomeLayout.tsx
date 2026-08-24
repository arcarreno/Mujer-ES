import { useState, useCallback, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import BottomNav, { type TabKey } from './BottomNav'
import LoadingFallback from '../ui/LoadingFallback'
import { signOut } from '../../lib/queries'

// Lazy load tab pages
const CursosPage = lazy(() => import('./CursosPage'))
const MisCursosPage = lazy(() => import('./MisCursosPage'))
const MapPage = lazy(() => import('./MapPage'))
const ChatsPage = lazy(() => import('./ChatsPage'))
const ProfilePage = lazy(() => import('./ProfilePage'))

interface HomeLayoutProps {
  username: string
  onLogout: () => void
}

// Las pestañas se montan en la primera visita y después quedan vivas (sin
// desmontar): los datos y los canales realtime persisten al cambiar de tab.
const TAB_ORDER: TabKey[] = ['cursos', 'mis-cursos', 'mapa', 'chats', 'perfil']

export default function HomeLayout({ username, onLogout }: HomeLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('cursos')
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set<TabKey>(['cursos']))
  const [chatFullscreen, setChatFullscreen] = useState(false)
  const [videoCallFullscreen, setVideoCallFullscreen] = useState(false)

  const handleLogout = async () => {
    await signOut()
    sileo.info({ title: 'Sesión cerrada', description: 'Hasta pronto' })
    onLogout()
  }

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab)
    setChatFullscreen(false)
    setVisited((prev) => {
      if (prev.has(tab)) return prev
      const next = new Set(prev)
      next.add(tab)
      return next
    })
  }, [])

  const handleChatFullscreenChange = useCallback((fullscreen: boolean) => {
    setChatFullscreen(fullscreen)
  }, [])

  const handleVideoCallFullscreenChange = useCallback((fullscreen: boolean) => {
    setVideoCallFullscreen(fullscreen)
  }, [])

  // When in chat or video call fullscreen, hide header and nav
  const showHeader = !chatFullscreen && !videoCallFullscreen
  const showNav = !chatFullscreen && !videoCallFullscreen

  return (
    <div className="home-layout">
      <AnimatePresence>
        {showHeader && (
          <motion.header
            className="home-header"
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <svg width="0" height="0" style={{ position: 'absolute' }}>
              <defs>
                <clipPath id="home-wave-clip" clipPathUnits="objectBoundingBox">
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
            <div className="home-header-left">
              <span className="home-greeting">Hola,</span>
              <h1 className="home-username">{username}</h1>
            </div>
            <button
              onClick={handleLogout}
              className="home-logout"
              type="button"
              aria-label="Cerrar sesión"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          </motion.header>
        )}
      </AnimatePresence>

      <main className="home-main" style={chatFullscreen ? { paddingBottom: 0 } : undefined}>
        {TAB_ORDER.map((tab) => {
          const visible = activeTab === tab
          if (!visited.has(tab)) return null
          const isMap = tab === 'mapa'
          const isChats = tab === 'chats'
          return (
            <div
              key={tab}
              className={`home-tab ${isMap ? 'home-tab--map' : ''} ${isChats ? 'home-tab--chats' : ''} ${visible ? 'home-tab--active' : ''}`}
              style={visible ? undefined : { display: 'none' }}
            >
              <Suspense fallback={<LoadingFallback />}>
                {tab === 'cursos' && (
                  <CursosPage onNavigateToMap={() => handleTabChange('mapa')} onVideoCallFullscreenChange={handleVideoCallFullscreenChange} />
                )}
                {tab === 'mis-cursos' && (
                  <MisCursosPage onNavigateToMap={() => handleTabChange('mapa')} onVideoCallFullscreenChange={handleVideoCallFullscreenChange} />
                )}
                {tab === 'mapa' && <MapPage active={visible} />}
                {tab === 'chats' && (
                  <ChatsPage onChatStateChange={handleChatFullscreenChange} />
                )}
                {tab === 'perfil' && <ProfilePage />}
              </Suspense>
            </div>
          )
        })}
      </main>

      <AnimatePresence>
        {showNav && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <BottomNav active={activeTab} onChange={handleTabChange} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
