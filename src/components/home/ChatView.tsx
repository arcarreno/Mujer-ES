import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  getMessages,
  sendMessage,
  markMessagesRead,
  subscribeToMessages,
  unsubscribeFromMessages,
  type Message,
} from '../../lib/queries'
import { supabase } from '../../lib/supabase'

interface ChatViewProps {
  conversationId: string
  onBack: () => void
  onOpenProfile?: (userId: string) => void
}

export default function ChatView({ conversationId, onBack, onOpenProfile }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [myId, setMyId] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyId(data.user.id)
    })
  }, [])

  // Keyboard handling
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    function setHeight() {
      const vh = window.visualViewport?.height || window.innerHeight
      container!.style.height = `${vh}px`
    }

    setHeight()
    window.visualViewport?.addEventListener('resize', setHeight)
    window.visualViewport?.addEventListener('scroll', setHeight)
    return () => {
      window.visualViewport?.removeEventListener('resize', setHeight)
      window.visualViewport?.removeEventListener('scroll', setHeight)
    }
  }, [])

  // Load messages
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMessages(conversationId)
      .then((msgs) => { if (!cancelled) setMessages(msgs) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [conversationId])

  // Subscribe to real-time
  useEffect(() => {
    subscribeToMessages(conversationId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    })
    return () => { unsubscribeFromMessages() }
  }, [conversationId])

  // Mark as read
  useEffect(() => {
    if (conversationId) markMessagesRead(conversationId)
  }, [conversationId, messages])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      const msg = await sendMessage(conversationId, text)
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
      <div className="chat-fullscreen" ref={chatContainerRef}>
        <div className="chat-fullscreen-header">
          <button className="volver-btn-sm" onClick={onBack} aria-label="Volver">
            <div className="volver-btn-sm-bg">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
                <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
                <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
              </svg>
            </div>
            <p className="volver-btn-sm-text">Volver</p>
          </button>
          <h2 className="chat-fullscreen-title">Chat</h2>
        </div>
        <div className="chat-empty">
          <div className="manage-loading">Cargando mensajes...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-fullscreen" ref={chatContainerRef}>
      <div className="chat-fullscreen-header">
        <button className="volver-btn-sm" onClick={onBack} aria-label="Volver">
          <div className="volver-btn-sm-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
            </svg>
          </div>
          <p className="volver-btn-sm-text">Volver</p>
        </button>
        <h2 className="chat-fullscreen-title">Chat</h2>
      </div>

      <div className="chat-container" style={{ height: 'auto', flex: 1 }}>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty" style={{ flex: 1 }}>
              <svg className="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="chat-empty-text">
                Sé la primera en escribir. Este chat es un espacio seguro para todas.
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
                    <div
                      className="chat-sender"
                      onClick={() => onOpenProfile?.(msg.sender_id)}
                      style={{ cursor: onOpenProfile ? 'pointer' : undefined }}
                    >
                      <div className={`chat-avatar ${isAdmin ? 'chat-avatar-admin' : ''}`}>
                        {msg.avatar_url ? (
                          <img src={msg.avatar_url} alt="" className="chat-avatar-img" />
                        ) : (
                          getInitials(msg.full_name || msg.username)
                        )}
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
