import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import BottomNav, { type TabKey } from './BottomNav'
import CursosPage from './CursosPage'
import ChatsPage from './ChatsPage'
import { signOut } from '../../lib/queries'

interface HomeLayoutProps {
  username: string
  onLogout: () => void
}

export default function HomeLayout({ username, onLogout }: HomeLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('cursos')

  const handleLogout = async () => {
    await signOut()
    sileo.info({ title: 'Sesión cerrada', description: 'Hasta pronto' })
    onLogout()
  }

  return (
    <div className="home-layout">
      <header className="home-header">
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
      </header>

      <main className="home-main">
        <AnimatePresence mode="wait">
          {activeTab === 'cursos' ? (
            <motion.div
              key="cursos"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <CursosPage />
            </motion.div>
          ) : (
            <motion.div
              key="chats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <ChatsPage />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}
