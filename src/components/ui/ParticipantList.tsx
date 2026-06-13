import type { ParticipantState } from '../../lib/webrtc'

interface ParticipantListProps {
  participants: ParticipantState[]
  currentUserId: string
  isAdmin: boolean
  onKick: (userId: string) => void
  onClose: () => void
}

export default function ParticipantList({
  participants,
  currentUserId,
  isAdmin,
  onKick,
  onClose,
}: ParticipantListProps) {
  const activeMics = participants.filter((p) => p.micActive).length
  const activeVideos = participants.filter((p) => p.videoActive).length

  return (
    <div className="participant-list">
      <div className="participant-list-header">
        <h3>Participantes ({participants.length})</h3>
        <button onClick={onClose} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="participant-list-stats">
        <span className="participant-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          {activeMics}/6
        </span>
        <span className="participant-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          {activeVideos}/6
        </span>
      </div>

      <div className="participant-list-items">
        {participants.map((p) => (
          <div key={p.userId} className="participant-item">
            <div className="participant-item-avatar">
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" />
              ) : (
                <span>{p.username?.charAt(0).toUpperCase() || '?'}</span>
              )}
              {p.isSpeaking && <div className="participant-speaking-dot" />}
            </div>
            <div className="participant-item-info">
              <span className="participant-item-name">
                {p.username}
                {p.userId === currentUserId && ' (Tú)'}
              </span>
              <div className="participant-item-icons">
                {p.micActive ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669" stroke="none">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
                {p.videoActive ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669" stroke="none">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </div>
            </div>
            {isAdmin && p.userId !== currentUserId && (
              <button
                className="participant-item-kick"
                onClick={() => onKick(p.userId)}
                type="button"
                title="Expulsar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
