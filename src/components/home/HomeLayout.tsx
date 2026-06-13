import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import BottomNav, { type TabKey } from './BottomNav'
import CursosPage from './CursosPage'
import MisCursosPage from './MisCursosPage'
import MapPage from './MapPage'
import ChatsPage from './ChatsPage'
import ProfilePage from './ProfilePage'
import { signOut } from '../../lib/queries'

interface HomeLayoutProps {
  username: string
  onLogout: () => void
}

export default function HomeLayout({ username, onLogout }: HomeLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('cursos')
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
        <AnimatePresence mode="wait">
          {activeTab === 'cursos' && (
            <motion.div
              key="cursos"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <CursosPage onNavigateToMap={() => setActiveTab('mapa')} onVideoCallFullscreenChange={handleVideoCallFullscreenChange} />
            </motion.div>
          )}
          {activeTab === 'mis-cursos' && (
            <motion.div
              key="mis-cursos"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <MisCursosPage onNavigateToMap={() => setActiveTab('mapa')} onVideoCallFullscreenChange={handleVideoCallFullscreenChange} />
            </motion.div>
          )}
          {activeTab === 'mapa' && (
            <motion.div
              key="mapa"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              <MapPage />
            </motion.div>
          )}
          {activeTab === 'chats' && (
            <motion.div
              key="chats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <ChatsPage onChatStateChange={handleChatFullscreenChange} />
            </motion.div>
          )}
          {activeTab === 'perfil' && (
            <motion.div
              key="perfil"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <ProfilePage />
            </motion.div>
          )}
        </AnimatePresence>
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
