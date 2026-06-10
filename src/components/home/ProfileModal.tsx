import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { getProfile, type Profile } from '../../lib/queries'

interface ProfileModalProps {
  userId: string
  onClose: () => void
  onStartChat: (userId: string) => void
  onReport: (userId: string) => void
}

export default function ProfileModal({ userId, onClose, onStartChat, onReport }: ProfileModalProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getProfile(userId)
      .then((p) => { if (!cancelled) setProfile(p) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  function getInitials(name?: string) {
    if (!name) return '?'
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="profile-modal"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="manage-loading">Cargando perfil...</div>
        </motion.div>
      </motion.div>
    )
  }

  if (!profile) return null

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="profile-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="profile-modal-close" onClick={onClose} aria-label="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="profile-modal-avatar">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="profile-modal-avatar-img" />
          ) : (
            <span className="profile-modal-avatar-initials">{getInitials(profile.full_name)}</span>
          )}
        </div>

        <h3 className="profile-modal-name">{profile.full_name}</h3>
        <p className="profile-modal-username">@{profile.username}</p>

        {profile.bio && (
          <p className="profile-modal-bio">{profile.bio}</p>
        )}

        {profile.hobbies && profile.hobbies.length > 0 && (
          <div className="profile-modal-hobbies">
            {profile.hobbies.map((h) => (
              <span key={h} className="profile-modal-hobby-chip">{h}</span>
            ))}
          </div>
        )}

        <div className="profile-modal-actions">
          <button
            className="profile-modal-btn report"
            onClick={() => onReport(userId)}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            Reportar
          </button>
          <button
            className="profile-modal-btn chat"
            onClick={() => onStartChat(userId)}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Iniciar conversación
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
