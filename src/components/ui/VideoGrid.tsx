import { useRef, useEffect } from 'react'
import type { ParticipantState } from '../../lib/webrtc'

interface VideoGridProps {
  localStream: MediaStream | null
  screenStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  participants: ParticipantState[]
  userId: string
  isScreenSharing: boolean
  isAdmin: boolean
}

export default function VideoGrid({
  localStream,
  screenStream,
  remoteStreams,
  participants,
  userId,
  isScreenSharing,
  isAdmin,
}: VideoGridProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)

  // Set local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Set screen share stream
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream
    }
  }, [screenStream])

  // Get active remote speakers (excluding self)
  const activeSpeakers = participants.filter(
    (p) => p.userId !== userId && (p.micActive || p.videoActive)
  )

  const myParticipant = participants.find((p) => p.userId === userId)

  return (
    <div className={`video-grid ${isScreenSharing ? 'video-grid--screenshare' : ''}`}>
      {/* Screen share — primary fullscreen view */}
      {isScreenSharing && screenStream && (
        <div className="video-grid-screenshare">
          <video ref={screenVideoRef} autoPlay playsInline className="video-tile-stream video-tile-stream--screenshare" />
          <div className="video-grid-screenshare-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Pantalla compartida
          </div>
        </div>
      )}

      {/* Thumbnails row — local camera + remote participants */}
      <div className="video-grid-thumbs">
        {/* Local video thumbnail */}
        {localStream && myParticipant?.videoActive && (
          <div className="video-tile video-tile--thumb video-tile--local">
            <video ref={localVideoRef} autoPlay playsInline muted className="video-tile-stream" />
            <div className="video-tile-overlay">
              <span className="video-tile-name">{myParticipant?.username || 'Tú'}</span>
              {myParticipant?.micActive && (
                <span className="video-tile-speaking">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Local avatar when camera is off */}
        {(!localStream || !myParticipant?.videoActive) && myParticipant && (
          <div className="video-tile video-tile--thumb video-tile--local">
            <div className="video-tile-avatar">
              {myParticipant.avatarUrl ? (
                <img src={myParticipant.avatarUrl} alt="" />
              ) : (
                <span>{myParticipant.username?.charAt(0).toUpperCase() || '?'}</span>
              )}
            </div>
            <div className="video-tile-overlay">
              <span className="video-tile-name">{myParticipant.username || 'Tú'}</span>
            </div>
          </div>
        )}

        {/* Remote participant thumbnails */}
        {activeSpeakers.map((p) => {
          const stream = remoteStreams.get(p.userId)
          return (
            <RemoteVideoTile
              key={p.userId}
              participant={p}
              stream={stream}
            />
          )
        })}
      </div>

      {/* Empty state — only when no screen share and nobody has video */}
      {!isScreenSharing && activeSpeakers.length === 0 && (!localStream || !myParticipant?.videoActive) && (
        <div className="video-grid-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p>Esperando participantes con cámara activa...</p>
        </div>
      )}
    </div>
  )
}

function RemoteVideoTile({
  participant,
  stream,
}: {
  participant: ParticipantState
  stream: MediaStream | undefined
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null
    }
  }, [stream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [])

  return (
    <div className={`video-tile video-tile--thumb ${participant.isSpeaking ? 'video-tile--speaking' : ''}`}>
      {participant.videoActive && stream ? (
        <video ref={videoRef} autoPlay playsInline className="video-tile-stream" />
      ) : (
        <div className="video-tile-avatar">
          {participant.avatarUrl ? (
            <img src={participant.avatarUrl} alt="" />
          ) : (
            <span>{participant.username?.charAt(0).toUpperCase() || '?'}</span>
          )}
        </div>
      )}
      <div className="video-tile-overlay">
        <span className="video-tile-name">{participant.username}</span>
        {participant.micActive && (
          <span className="video-tile-speaking">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </span>
        )}
        {!participant.micActive && (
          <span className="video-tile-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </span>
        )}
      </div>
    </div>
  )
}
