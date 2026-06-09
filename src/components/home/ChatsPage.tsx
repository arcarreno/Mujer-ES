import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  getMyConversation,
  createConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  type Conversation,
  type Message,
} from '../../lib/queries'

export default function ChatsPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load conversation
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const conv = await getMyConversation()
        if (!cancelled) {
          setConversation(conv)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Load messages when conversation exists
  useEffect(() => {
    if (!conversation) return
    let cancelled = false

    async function loadMessages() {
      try {
        const msgs = await getMessages(conversation!.id)
        if (!cancelled) setMessages(msgs)
      } catch {
        // ignore
      }
    }

    loadMessages()
    const interval = setInterval(loadMessages, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [conversation])

  // Mark messages as read when conversation loads
  useEffect(() => {
    if (!conversation) return
    markMessagesRead(conversation.id)
  }, [conversation, messages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleStartConversation() {
    try {
      const conv = await createConversation()
      setConversation(conv)
    } catch {
      // ignore
    }
  }

  async function handleSend() {
    if (!input.trim() || !conversation || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      const msg = await sendMessage(conversation.id, text)
      setMessages((prev) => [...prev, msg])
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

  if (loading) {
    return (
      <div className="chats-page">
        <div className="chats-header">
          <h2 className="chats-title">Chats</h2>
          <p className="chats-subtitle">Conversación con el equipo de apoyo</p>
        </div>
        <div className="chat-empty">
          <div className="manage-loading">Cargando...</div>
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="chats-page">
        <div className="chats-header">
          <h2 className="chats-title">Chats</h2>
          <p className="chats-subtitle">Conversación con el equipo de apoyo</p>
        </div>
        <div className="chat-empty">
          <svg className="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className="chat-empty-text">
            ¿Tenés alguna pregunta o necesitás ayuda? Iniciá una conversación con nuestro equipo.
          </p>
          <button className="chat-start-btn" onClick={handleStartConversation}>
            Iniciar conversación
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="chats-page">
      <div className="chats-header">
        <h2 className="chats-title">Chats</h2>
        <p className="chats-subtitle">Conversación con el equipo de apoyo</p>
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
                  className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-admin'}`}
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
  )
}
