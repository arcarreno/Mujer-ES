interface CallControlsProps {
  micActive: boolean
  videoActive: boolean
  isScreenSharing: boolean
  isAdmin: boolean
  onToggleMic: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onToggleParticipants: () => void
  onToggleChat: () => void
  onMuteAll: () => void
  onEndSession: () => void
  onLeave: () => void
  micCount: number
  videoCount: number
}

export default function CallControls({
  micActive,
  videoActive,
  isScreenSharing,
  isAdmin,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onToggleParticipants,
  onToggleChat,
  onMuteAll,
  onEndSession,
  onLeave,
  micCount,
  videoCount,
}: CallControlsProps) {
  return (
    <div className="video-call-controls">
      <div className="video-call-controls-left">
        <button
          className={`control-btn ${micActive ? 'control-btn--active' : 'control-btn--off'}`}
          onClick={onToggleMic}
          type="button"
          title={micActive ? 'Silenciar' : 'Activar micrófono'}
        >
          {micActive ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          <span className="control-label">{micActive ? 'Mic On' : 'Mic Off'}</span>
          <span className="control-count">{micCount}/6</span>
        </button>

        <button
          className={`control-btn ${videoActive ? 'control-btn--active' : 'control-btn--off'}`}
          onClick={onToggleVideo}
          type="button"
          title={videoActive ? 'Apagar cámara' : 'Encender cámara'}
        >
          {videoActive ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
          <span className="control-label">{videoActive ? 'Cam On' : 'Cam Off'}</span>
          <span className="control-count">{videoCount}/6</span>
        </button>
      </div>

      <div className="video-call-controls-center">
        <button
          className="control-btn control-btn--danger"
          onClick={onLeave}
          type="button"
          title="Salir de la llamada"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>

        {isAdmin && (
          <button
            className="control-btn control-btn--end"
            onClick={onEndSession}
            type="button"
            title="Finalizar sesión para todos"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        )}
      </div>

      <div className="video-call-controls-right">
        {isAdmin && (
          <button
            className="control-btn"
            onClick={onMuteAll}
            type="button"
            title="Silenciar a todos"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            <span className="control-label">Silenciar todos</span>
          </button>
        )}

        {isAdmin && (
          <button
            className="control-btn"
            onClick={onToggleScreenShare}
            type="button"
            title={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
          >
            {isScreenSharing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="7" y1="8" x2="17" y2="14" />
                <line x1="17" y1="8" x2="7" y2="14" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            )}
            <span className="control-label">{isScreenSharing ? 'Dejar de compartir' : 'Compartir'}</span>
          </button>
        )}

        <button
          className="control-btn"
          onClick={onToggleParticipants}
          type="button"
          title="Participantes"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>

        <button
          className="control-btn"
          onClick={onToggleChat}
          type="button"
          title="Chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
