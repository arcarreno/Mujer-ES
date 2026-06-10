interface AdminDashboardProps {
  userCount: number
  blockedCount: number
  onGoToUsers: () => void
  onGoToChats: () => void
  onGoToReports: () => void
}

interface AdminCard {
  id: string
  title: string
  description: string
  count?: number
  badge?: string
  icon: React.ReactNode
  onClick: () => void
}

export default function AdminDashboard({ userCount, blockedCount, onGoToUsers, onGoToChats, onGoToReports }: AdminDashboardProps) {
  const cards: AdminCard[] = [
    {
      id: 'users',
      title: 'Gestionar usuarios',
      description: 'Ver, agregar, eliminar o bloquear usuarios registrados',
      count: userCount,
      badge: blockedCount > 0 ? `${blockedCount} bloqueado${blockedCount > 1 ? 's' : ''}` : undefined,
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      onClick: onGoToUsers,
    },
    {
      id: 'chats',
      title: 'Chats',
      description: 'Conversaciones con usuarios y asistente',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      onClick: onGoToChats,
    },
    {
      id: 'reports',
      title: 'Reportes',
      description: 'Estadísticas y métricas de la plataforma',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      ),
      onClick: onGoToReports,
    },
  ]

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <h2 className="cursos-title">Panel de administración</h2>
        <p className="cursos-subtitle">Gestiona todos los aspectos de Mujer-ES</p>
      </div>

      <div className="admin-cards-grid">
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={card.onClick}
            className="admin-card"
            type="button"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="admin-card-icon">{card.icon}</div>
            <div className="admin-card-body">
              <div className="admin-card-top">
                <h3 className="admin-card-title">{card.title}</h3>
                {card.count !== undefined && (
                  <span className="admin-card-count">{card.count}</span>
                )}
              </div>
              <p className="admin-card-desc">{card.description}</p>
              {card.badge && (
                <span className="admin-card-badge">{card.badge}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
