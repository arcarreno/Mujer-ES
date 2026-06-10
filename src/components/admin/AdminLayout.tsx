import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import AdminBottomNav, { type AdminTabKey } from './AdminBottomNav'
import AdminDashboard from './AdminDashboard'
import ManageUsers from './ManageUsers'
import AdminCursos from './AdminCursos'
import CreateCoursePage from './CreateCoursePage'
import CreateUserPage from './CreateUserPage'
import AdminChats from './AdminChats'
import ProfilePage from '../home/ProfilePage'
import UserDetailPage from './UserDetailPage'
import { signOut } from '../../lib/queries'
import { listUsers, type UserRow } from '../../lib/admin'
import { supabase } from '../../lib/supabase'
import type { Course } from '../../lib/queries'

interface AdminLayoutProps {
  username: string
  onLogout: () => void
}

export default function AdminLayout({ username, onLogout }: AdminLayoutProps) {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('dashboard')
  const [userCount, setUserCount] = useState(0)
  const [blockedCount, setBlockedCount] = useState(0)
  const [showCreateCourse, setShowCreateCourse] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')

  useEffect(() => {
    let cancelled = false
    listUsers()
      .then((users) => {
        if (cancelled) return
        setUserCount(users.length)
        setBlockedCount(users.filter((u) => u.blocked).length)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeTab])

  // Get current user id for self-check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id)
    })
  }, [])

  const handleLogout = async () => {
    await signOut()
    sileo.info({ title: 'Sesión cerrada', description: 'Hasta pronto' })
    onLogout()
  }

  const handleSelectUser = useCallback((user: UserRow) => {
    setSelectedUser(user)
  }, [])

  const handleCloseUser = useCallback(() => {
    setSelectedUser(null)
  }, [])

  // When viewing user detail, hide header and nav
  const showHeader = !selectedUser
  const showNav = !selectedUser

  return (
    <div className="home-layout admin-layout">
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
              <span className="home-greeting">Admin ·</span>
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

      <main className="home-main" style={selectedUser ? { paddingBottom: 0 } : undefined}>
        {showCreateCourse ? (
          <CreateCoursePage
            onCreated={(course: Course) => {
              setShowCreateCourse(false)
              setActiveTab('cursos')
              sileo.success({ title: 'Curso creado', description: `"${course.title}" fue creado exitosamente` })
            }}
            onBack={() => setShowCreateCourse(false)}
          />
        ) : showCreateUser ? (
          <CreateUserPage
            onCreated={() => {
              setShowCreateUser(false)
              setActiveTab('users')
            }}
            onBack={() => setShowCreateUser(false)}
          />
        ) : selectedUser ? (
          <UserDetailPage
            user={selectedUser}
            currentUserId={currentUserId}
            onBack={handleCloseUser}
            onUpdate={() => {}}
          />
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <AdminDashboard
                  userCount={userCount}
                  blockedCount={blockedCount}
                  onGoToUsers={() => setActiveTab('users')}
                  onGoToChats={() => setActiveTab('chats')}
                />
              </motion.div>
            )}
            {activeTab === 'users' && (
              <motion.div
                key="users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <ManageUsers
                  onCountsChange={(u, b) => { setUserCount(u); setBlockedCount(b) }}
                  onCreateUser={() => setShowCreateUser(true)}
                  onSelectUser={handleSelectUser}
                />
              </motion.div>
            )}
            {activeTab === 'cursos' && (
              <motion.div
                key="cursos"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <AdminCursos onCreateCourse={() => setShowCreateCourse(true)} />
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
                <AdminChats />
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
        )}
      </main>

      <AnimatePresence>
        {showNav && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <AdminBottomNav active={activeTab} onChange={setActiveTab} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
