import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  getAllConversations,
  getMessages,
  sendMessage,
  markMessagesRead,
  type Conversation,
  type Message,
} from '../../lib/queries'

type ConversationWithProfile = Conversation & { username: string; full_name: string }

export default function AdminChats() {
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([])
  const [selected, setSelected] = useState<ConversationWithProfile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load conversations
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const convs = await getAllConversations()
        if (!cancelled) {
          setConversations(convs)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Load messages when a conversation is selected
  useEffect(() => {
    if (!selected) return
    let cancelled = false

    async function loadMessages() {
      try {
        const msgs = await getMessages(selected!.id)
        if (!cancelled) setMessages(msgs)
      } catch {
        // ignore
      }
    }

    loadMessages()
    markMessagesRead(selected.id)

    // Refresh conversation list to update unread badges
    const interval = setInterval(async () => {
      try {
        const updated = await getMessages(selected!.id)
        if (!cancelled) setMessages(updated)
      } catch {
        // ignore
      }
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selected])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSelect(convo: ConversationWithProfile) {
    setSelected(convo)
    // Clear unread badge locally
    setConversations((prev) =>
      prev.map((c) => c.id === convo.id ? { ...c, unread_admin: 0 } : c)
    )
  }

  async function handleSend() {
    if (!input.trim() || !selected || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      const msg = await sendMessage(selected.id, text)
      setMessages((prev) => [...prev, msg])
      // Update conversation list order
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === selected.id ? { ...c, last_message_at: msg.created_at } : c
        )
        return updated.sort((a, b) => {
          const aTime = a.last_message_at ?? a.created_at
          const bTime = b.last_message_at ?? b.created_at
          return bTime > aTime ? 1 : -1
        })
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

  function formatTime(dateStr: string | null) {
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

  function getInitial(name: string) {
    return name?.charAt(0).toUpperCase() ?? '?'
  }

  // Conversation list view
  if (!selected) {
    return (
      <div className="admin-chats">
        <div className="admin-dashboard-header">
          <h2 className="cursos-title">Chats</h2>
          <p className="cursos-subtitle">Gestión de conversaciones con usuarios</p>
        </div>

        {loading ? (
          <div className="manage-loading">Cargando conversaciones...</div>
        ) : conversations.length === 0 ? (
          <div className="admin-chats-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>No hay conversaciones aún</p>
            <span>Las conversaciones de los usuarios aparecerán aquí</span>
          </div>
        ) : (
          <div className="admin-chats-list">
            {conversations.map((convo, i) => (
              <motion.button
                key={convo.id}
                className="admin-chat-row"
                onClick={() => handleSelect(convo)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
              >
                <div className="admin-chat-avatar">
                  {getInitial(convo.full_name || convo.username)}
                </div>
                <div className="admin-chat-body">
                  <div className="admin-chat-name">{convo.full_name || convo.username}</div>
                  <div className="admin-chat-preview">
                    {convo.last_message_at ? 'Conversación activa' : 'Sin mensajes aún'}
                  </div>
                </div>
                <div className="admin-chat-right">
                  <span className="admin-chat-time">{formatTime(convo.last_message_at)}</span>
                  {(convo.unread_admin ?? 0) > 0 && (
                    <span className="admin-chat-unread">{convo.unread_admin}</span>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Chat detail view
  return (
    <div className="admin-chats">
      <div className="admin-chat-detail">
        <button className="admin-chat-back" onClick={() => setSelected(null)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Volver
        </button>

        <div className="admin-chat-header-name">
          {selected.full_name || selected.username}
        </div>

        <div className="chat-container">
          <div className="chat-messages">
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isUser = msg.sender_role === 'user'
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`chat-bubble ${isUser ? 'chat-bubble-admin' : 'chat-bubble-user'}`}
                  >
                    <div>{msg.content}</div>
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
    </div>
  )
}
