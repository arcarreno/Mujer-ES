import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'motion/react'
import {
  getUserConversations,
  createDMConversation,
  subscribeToConversations,
  unsubscribeFromConversations,
  type ConversationListItem,
} from '../../lib/queries'
import ChatView from '../home/ChatView'
import ProfileModal from '../home/ProfileModal'
import ReportModal from '../home/ReportModal'
import DeleteChatModal from '../home/DeleteChatModal'
import Skeleton from '../ui/Skeleton'

interface AdminChatsProps {
  onChatStateChange?: (fullscreen: boolean) => void
}

export default function AdminChats({ onChatStateChange }: AdminChatsProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [profileModalUser, setProfileModalUser] = useState<string | null>(null)
  const [reportModalUser, setReportModalUser] = useState<string | null>(null)
  const [deleteConv, setDeleteConv] = useState<ConversationListItem | null>(null)

  const loadConversations = useCallback(async () => {
    try {
      const convs = await getUserConversations()
      setConversations(convs)
    } catch (e) {
      console.error('[AdminChats] loadConversations error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    subscribeToConversations(() => {
      loadConversations()
    })
    return () => { unsubscribeFromConversations() }
  }, [loadConversations])

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

  return (
    <div className={`chat-list-page ${activeChat ? 'has-chat' : ''}`}>
      <div className="chat-list-sidebar">
        <div className="chat-list-header">
          <div className="chat-list-header-top">
            {activeChat && (
              <button className="volver-btn-sm volver-btn-sm-light" onClick={() => { setActiveChat(null); onChatStateChange?.(false) }} aria-label="Volver">
                <div className="volver-btn-sm-bg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
                    <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
                    <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
                  </svg>
                </div>
                <p className="volver-btn-sm-text">Volver</p>
              </button>
            )}
            <h2 className="cursos-title">Chats</h2>
          </div>
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
                <div
                  key={conv.id}
                  className={`chat-list-card ${hasUnread ? 'unread' : ''} ${activeChat === conv.id ? 'active' : ''}`}
                >
                  <button
                    className="chat-list-card-main"
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

                  {!isActive && (
                    <button
                      className="chat-list-card-delete"
                      onClick={() => setDeleteConv(conv)}
                      type="button"
                      aria-label={`Eliminar chat con ${other?.full_name || '.usuario'}`}
                      title="Eliminar chat"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="chat-list-content">
        {activeChat ? (
          <ChatView
            conversationId={activeChat}
            onBack={() => {
              setActiveChat(null)
              onChatStateChange?.(false)
            }}
            onOpenProfile={(userId) => setProfileModalUser(userId)}
          />
        ) : (
          <div className="chat-list-empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="chat-list-empty-icon">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 className="chat-list-empty-title">Seleccioná un chat</h3>
            <p className="chat-list-empty-text">Elegí una conversación para empezar a chatear</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {profileModalUser && (
          <ProfileModal
            userId={profileModalUser}
            onClose={() => setProfileModalUser(null)}
            onStartChat={async (userId) => {
              setProfileModalUser(null)
              const conv = await createDMConversation(userId)
              setActiveChat(conv.id)
              onChatStateChange?.(true)
            }}
            onReport={(userId) => {
              setProfileModalUser(null)
              setReportModalUser(userId)
            }}
          />
        )}
        {reportModalUser && (
          <ReportModal
            userId={reportModalUser}
            onClose={() => setReportModalUser(null)}
          />
        )}
        {deleteConv && (
          <DeleteChatModal
            conversationId={deleteConv.id}
            conversationName={deleteConv.other_user?.full_name || '.usuario'}
            onClose={() => setDeleteConv(null)}
            onDeleted={() => {
              setDeleteConv(null)
              loadConversations()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
