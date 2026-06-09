import { motion } from 'motion/react'

export type TabKey = 'cursos' | 'mis-cursos' | 'mapa' | 'chats'

interface BottomNavProps {
  active: TabKey
  onChange: (tab: TabKey) => void
}

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'cursos',
    label: 'Cursos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    key: 'mis-cursos',
    label: 'Mis cursos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        <polyline points="9 11 12 14 22 4" />
      </svg>
    ),
  },
  {
    key: 'mapa',
    label: 'Mapa',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    key: 'chats',
    label: 'Chats',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
]

export default function BottomNav({ active, onChange }: BottomNavProps) {
  const activeIndex = tabs.findIndex((t) => t.key === active)

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <motion.div
        className="bottom-nav-pill"
        animate={{ x: activeIndex * 100 + '%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`bottom-nav-btn${active === tab.key ? ' active' : ''}`}
          type="button"
          aria-current={active === tab.key ? 'page' : undefined}
        >
          <span className="bottom-nav-icon">{tab.icon}</span>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
