interface ConversationPreview {
  id: string
  name: string
  lastMessage: string
  time: string
  unread: number
  isBot?: boolean
}

const conversations: ConversationPreview[] = [
  {
    id: '1',
    name: 'Asistente Mujer-ES',
    lastMessage: 'Hola, ¿en qué puedo ayudarte hoy?',
    time: 'Ahora',
    unread: 0,
    isBot: true,
  },
  {
    id: '2',
    name: 'Equipo de apoyo',
    lastMessage: 'Recuerda que estamos aquí para escucharte.',
    time: 'Ayer',
    unread: 1,
  },
]

export default function ChatsPage() {
  return (
    <div className="chats-page">
      <div className="chats-header">
        <h2 className="chats-title">Chats</h2>
        <p className="chats-subtitle">Conversaciones con el equipo y el asistente</p>
      </div>

      <div className="chats-list">
        {conversations.map((conv, i) => (
          <article
            key={conv.id}
            className="chat-row"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={`chat-avatar${conv.isBot ? ' bot' : ''}`}>
              {conv.isBot ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <div className="chat-body">
              <div className="chat-row-top">
                <h3 className="chat-name">{conv.name}</h3>
                <span className="chat-time">{conv.time}</span>
              </div>
              <p className="chat-last">{conv.lastMessage}</p>
            </div>
            {conv.unread > 0 && (
              <span className="chat-unread">{conv.unread}</span>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
