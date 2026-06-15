import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import {
  getUserConversations,
  createDMConversation,
  subscribeToConversations,
  unsubscribeFromConversations,
  checkUserBlocked,
  type ConversationListItem,
} from '../../lib/queries'
import { usePresence } from '../../hooks/usePresence'
import { supabase } from '../../lib/supabase'
import ChatView from './ChatView'
import ProfileModal from './ProfileModal'
import ReportModal from './ReportModal'
import BlockedModal from './BlockedModal'
import Skeleton from '../ui/Skeleton'

interface ChatsPageProps {
  onBack?: () => void
  onChatStateChange?: (fullscreen: boolean) => void
}

export default function ChatsPage({ onChatStateChange }: ChatsPageProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [profileModalUser, setProfileModalUser] = useState<string | null>(null)
  const [reportModalUser, setReportModalUser] = useState<string | null>(null)
  const [blockedInfo, setBlockedInfo] = useState<{ blocked: boolean; until: string | null }>({ blocked: false, until: null })
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null)
    })
  }, [])

  const { isUserOnline } = usePresence(currentUserId)

  const loadConversations = useCallback(async () => {
    try {
      const convs = await getUserConversations()
      setConversations(convs)
    } catch (e) {
      console.error('[ChatsPage] loadConversations error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load conversations
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Subscribe to real-time changes
  useEffect(() => {
    subscribeToConversations(() => {
      loadConversations()
    })
    return () => { unsubscribeFromConversations() }
  }, [loadConversations])

  // Check if blocked
  useEffect(() => {
    checkUserBlocked().then((info) => {
      if (info.blocked) setBlockedInfo(info)
    })
  }, [])

  const handleStartChat = useCallback(async (targetUserId: string) => {
    setProfileModalUser(null)
    try {
      const conv = await createDMConversation(targetUserId)
      setActiveChat(conv.id)
      onChatStateChange?.(true)
    } catch (e: any) {
      sileo.error({ title: 'Error', description: e.message || 'No se pudo crear el chat' })
    }
  }, [onChatStateChange])

  const handleReport = useCallback((userId: string) => {
    setProfileModalUser(null)
    setReportModalUser(userId)
  }, [])

  function getInitials(name?: string) {
    if (!name) return '?'
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  function formatTime(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Ahora'
    if (diffMin < 60) return `${diffMin}m`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h`
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  // If viewing a chat, show ChatView
  if (activeChat) {
    return (
      <>
        <ChatView
          conversationId={activeChat}
          onBack={() => {
            setActiveChat(null)
            onChatStateChange?.(false)
          }}
          onOpenProfile={(userId) => setProfileModalUser(userId)}
        />
        <AnimatePresence>
          {profileModalUser && (
            <ProfileModal
              userId={profileModalUser}
              onClose={() => setProfileModalUser(null)}
              onStartChat={handleStartChat}
              onReport={handleReport}
            />
          )}
          {reportModalUser && (
            <ReportModal
              userId={reportModalUser}
              onClose={() => setReportModalUser(null)}
            />
          )}
        </AnimatePresence>
      </>
    )
  }

  return (
    <div className="chat-list-page">
      <div className="chat-list-header">
        <h2 className="cursos-title">Chats</h2>
        <p className="cursos-subtitle">Conversaciones activas</p>
      </div>

      {loading ? (
        <Skeleton lines={4} />
      ) : conversations.length === 0 ? (
        <div className="chat-list-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p>No hay conversaciones aún</p>
        </div>
      ) : (
        <div className="chat-list-grid">
          {conversations.map((conv) => {
            const other = conv.other_user
            const isActive = conv.type === 'general'
            const hasUnread = (conv.unread_count || 0) > 0

            return (
              <button
                key={conv.id}
                className={`chat-list-card ${hasUnread ? 'unread' : ''}`}
                onClick={() => {
                  setActiveChat(conv.id)
                  onChatStateChange?.(true)
                }}
                type="button"
              >
                <div className="chat-list-card-avatar">
                  {other?.avatar_url ? (
                    <img src={other.avatar_url} alt="" className="chat-list-card-avatar-img" />
                  ) : (
                    <span className="chat-list-card-avatar-initials">
                      {isActive ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        getInitials(other?.full_name)
                      )}
                    </span>
                  )}
                  {!isActive && other?.id && isUserOnline(other.id) && (
                    <span className="chat-online-dot" />
                  )}
                  {hasUnread && <span className="chat-list-card-badge">{conv.unread_count}</span>}
                </div>

                <div className="chat-list-card-info">
                  <div className="chat-list-card-top">
                    <h3 className="chat-list-card-name">
                      {isActive ? 'Chat General' : other?.full_name || '.usuario'}
                    </h3>
                    <span className="chat-list-card-time">
                      {formatTime(conv.last_message_time)}
                    </span>
                  </div>
                  <p className="chat-list-card-preview">
                    {conv.last_message || 'Sin mensajes aún'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {profileModalUser && (
          <ProfileModal
            userId={profileModalUser}
            onClose={() => setProfileModalUser(null)}
            onStartChat={handleStartChat}
            onReport={handleReport}
          />
        )}
        {reportModalUser && (
          <ReportModal
            userId={reportModalUser}
            onClose={() => setReportModalUser(null)}
          />
        )}
        {blockedInfo.blocked && (
          <BlockedModal until={blockedInfo.until!} />
        )}
      </AnimatePresence>
    </div>
  )
}
