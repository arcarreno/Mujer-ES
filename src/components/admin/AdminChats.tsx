import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  getGeneralChat,
  getMessages,
  sendMessage,
  markMessagesRead,
  subscribeToMessages,
  unsubscribeFromMessages,
  type Conversation,
  type Message,
} from '../../lib/queries'
import { supabase } from '../../lib/supabase'

export default function AdminChats() {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [myId, setMyId] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get current user id
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyId(data.user.id)
    })
  }, [])

  // Load general chat
  useEffect(() => {
    let cancelled = false
    getGeneralChat()
      .then((conv) => { if (!cancelled) setConversation(conv) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Load messages + subscribe to real-time
  useEffect(() => {
    if (!conversation) return
    let cancelled = false

    async function loadMessages() {
      try {
        const msgs = await getMessages(conversation!.id)
        if (!cancelled) setMessages(msgs)
      } catch {}
    }

    loadMessages()

    // Subscribe to new messages via Realtime
    subscribeToMessages(conversation!.id, (msg) => {
      if (!cancelled) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      }
    })

    return () => {
      cancelled = true
      unsubscribeFromMessages()
    }
  }, [conversation])

  // Mark as read
  useEffect(() => {
    if (!conversation) return
    markMessagesRead(conversation.id)
  }, [conversation, messages])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || !conversation || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      const msg = await sendMessage(conversation.id, text)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      inputRef.current?.focus()
    } catch {
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function formatTime(dateStr: string) {
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

  function getInitials(name?: string) {
    if (!name) return '?'
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="admin-chats">
        <div className="admin-dashboard-header">
          <h2 className="cursos-title">Chat general</h2>
          <p className="cursos-subtitle">Canal abierto para todas las usuarias</p>
        </div>
        <div className="manage-loading">Cargando chat...</div>
      </div>
    )
  }

  return (
    <div className="admin-chats">
      <div className="admin-dashboard-header">
        <h2 className="cursos-title">Chat general</h2>
        <p className="cursos-subtitle">Canal abierto para todas las usuarias</p>
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty" style={{ flex: 1 }}>
              <svg className="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="chat-empty-text">
                Aún no hay mensajes. Escribí para iniciar la conversación.
              </p>
            </div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isMe = msg.sender_id === myId
              const isAdmin = msg.sender_role === 'admin'
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}
                >
                  {!isMe && (
                    <div className="chat-sender">
                      <div className={`chat-avatar ${isAdmin ? 'chat-avatar-admin' : ''}`}>
                        {getInitials(msg.full_name || msg.username)}
                      </div>
                      <span className="chat-username">{msg.username || '.usuario'}</span>
                      {isAdmin && <span className="chat-admin-badge">Admin</span>}
                    </div>
                  )}
                  <div className="chat-bubble-content">{msg.content}</div>
                  <div className="chat-time">{formatTime(msg.created_at)}</div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-bar">
          <input
            ref={inputRef}
            type="text"
            placeholder="Escribí tu mensaje..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={500}
            disabled={sending}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Enviar mensaje"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
