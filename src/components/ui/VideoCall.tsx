import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { sileo } from 'sileo'
import { supabase } from '../../lib/supabase'
import { createCallSession, getActiveSession } from '../../lib/call-api'
import {
  VideoCallManager,
  type ParticipantState,
} from '../../lib/webrtc'
import VideoGrid from './VideoGrid'
import CallControls from './CallControls'
import ParticipantList from './ParticipantList'
import CallTimer from './CallTimer'

interface VideoCallProps {
  courseId: string
  isAdmin: boolean
  onClose: () => void
  onFullscreenChange?: (fullscreen: boolean) => void
}

export default function VideoCall({ courseId, isAdmin, onClose, onFullscreenChange }: VideoCallProps) {
  const [userId, setUserId] = useState<string>('')
  const [username, setUsername] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [participants, setParticipants] = useState<ParticipantState[]>([])
  const [micActive, setMicActive] = useState(false)
  const [videoActive, setVideoActive] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [remoteScreenShareUserId, setRemoteScreenShareUserId] = useState<string | null>(null)
  const [showParticipants, setShowParticipants] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<{ userId: string; username: string; text: string; time: number }[]>([])
  const [sessionEnded, setSessionEnded] = useState(false)
  const [kicked, setKicked] = useState(false)
  const managerRef = useRef<VideoCallManager | null>(null)
  const streamInitializedRef = useRef(false)
  const userIdRef = useRef('')
  const initRanRef = useRef(false)
  const durableSignalingRef = useRef(false)

  // Store callbacks in refs to prevent effect re-runs
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onFullscreenChangeRef = useRef(onFullscreenChange)
  onFullscreenChangeRef.current = onFullscreenChange

  // Initialize — only runs once per courseId+isAdmin
  useEffect(() => {
    if (initRanRef.current) return
    initRanRef.current = true

    let cancelled = false

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

      setUserId(user.id)
      userIdRef.current = user.id

      // Get username and avatar
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', user.id)
        .single()

      let uname = ''
      let aUrl: string | null = null

      if (!profile) {
        const { data: admin } = await supabase
          .from('admins')
          .select('username, avatar_url')
          .eq('id', user.id)
          .single()
        if (admin) {
          uname = admin.username
          aUrl = admin.avatar_url
        }
      } else {
        uname = profile.username
        aUrl = profile.avatar_url
      }

      setUsername(uname)
      setAvatarUrl(aUrl)

      // Create manager
      const manager = new VideoCallManager(courseId, user.id, isAdmin)
      managerRef.current = manager

      // Set up remote stream handler
      manager.peers.setOnRemoteStream((peerUserId, stream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.set(peerUserId, stream)
          return next
        })
      })

      // Set up peer removed handler
      manager.peers.setOnPeerRemoved((peerUserId) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.delete(peerUserId)
          return next
        })
      })

      // Set up presence update handler — deduplicate by userId
      manager.setOnPresenceUpdate((state) => {
        const seen = new Set<string>()
        const list: ParticipantState[] = []
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences) {
            const ps = p as ParticipantState
            if (!seen.has(ps.userId)) {
              seen.add(ps.userId)
              list.push(ps)
            }
          }
        }
        // Always include local participant with current state
        const myId = userIdRef.current
        setParticipants(prev => {
          const local = prev.find(p => p.userId === myId)
          if (local && !seen.has(myId)) {
            list.push(local)
          }
          return list.sort((a, b) => a.joinedAt - b.joinedAt)
        })
      })

      // Admin: when a new user joins, send them an offer (deduplicated)
      if (isAdmin) {
        const offeredUsers = new Set<string>()

        // Clear offered set when user truly leaves (after grace period)
        manager.setOnUserLeft((leftUserId) => {
          console.log(`[VideoCall] User ${leftUserId} left, clearing offer state`)
          offeredUsers.delete(leftUserId)
        })

        manager.setOnUserJoined(async (newUserId) => {
          if (offeredUsers.has(newUserId)) {
            console.log(`[VideoCall] Already offered to ${newUserId}, skipping`)
            return
          }
          offeredUsers.add(newUserId)
          try {
            await manager.peers.createOffer(newUserId)
          } catch (e) {
            console.error('Failed to create offer:', e)
            offeredUsers.delete(newUserId) // Allow retry on error
          }
        })
      }

      // Register callbacks for incoming signals
      manager.onMuteAll(async () => {
        await manager.toggleMic(false)
        setMicActive(false)
        sileo.info({ title: 'Silenciado', description: 'El administrador silenció tu micrófono' })
      })

      manager.onKick((targetUserId: string) => {
        if (targetUserId === user.id) {
          setKicked(true)
          sileo.error({ title: 'Expulsado', description: 'Fuiste expulsado de la sesión' })
          setTimeout(() => {
            manager.peers.getLocalStreamRef()?.getTracks().forEach(t => t.stop())
            manager.peers.cleanup()
            manager.signaling.leave()
            onClose()
          }, 2000)
        }
      })

      manager.onEndSession(() => {
        setSessionEnded(true)
        sileo.info({ title: 'Sesión finalizada', description: 'El administrador finalizó la sesión' })
        setTimeout(() => {
          manager.peers.getLocalStreamRef()?.getTracks().forEach(t => t.stop())
          manager.peers.cleanup()
          manager.signaling.leave()
          onClose()
        }, 2000)
      })

      // Register chat message handler before join
      manager.onChatMessage((msg) => {
        setChatMessages(prev => [...prev, msg])
      })

      // Screen share from remote user → switch layout
      manager.onScreenShareStarted((fromUserId) => {
        console.log(`[VideoCall] Remote screen share started by ${fromUserId}`)
        setRemoteScreenShareUserId(fromUserId)
      })

      manager.onScreenShareStopped(() => {
        console.log(`[VideoCall] Remote screen share stopped`)
        setRemoteScreenShareUserId(null)
      })

      // IMPORTANT: Get local stream BEFORE joining signaling
      // This ensures tracks are available when admin creates offer
      if (!streamInitializedRef.current) {
        streamInitializedRef.current = true
        try {
          console.log('[VideoCall] Requesting local stream...')
          const stream = await manager.peers.ensureLocalStream()
          console.log(`[VideoCall] Local stream ready: ${stream.getTracks().length} tracks`)
          setLocalStream(stream)
        } catch (e) {
          console.error('[VideoCall] Failed to get local stream:', e)
          // Continue without stream — user can still receive video
        }
      }

      // Now join signaling channel (stream is ready for peer connections)
      console.log('[VideoCall] Joining signaling...')
      await manager.join()
      console.log('[VideoCall] Signaling joined, tracking presence...')

      // Track presence after joining — derive mic/video from actual stream tracks,
      // NOT from React state (which hasn't updated yet due to stale closures)
      const localStream = manager.peers.getLocalStreamRef()
      const localTracks = localStream?.getTracks() ?? []
      const hasMic = localTracks.some(t => t.kind === 'audio' && t.enabled)
      const hasCam = localTracks.some(t => t.kind === 'video' && t.enabled)
      const presenceData: ParticipantState = {
        userId: user.id,
        username: uname,
        avatarUrl: aUrl,
        micActive: hasMic,
        videoActive: hasCam,
        isSpeaking: false,
        screenSharing: false,
        joinedAt: Date.now(),
        epoch: 0,
      }
      await manager.signaling.trackPresence(presenceData)
      setMicActive(hasMic)
      setVideoActive(hasCam)
      setParticipants([presenceData])

      // =====================================================
      // SESSION LIFECYCLE FOR DURABLE SIGNALING
      // Admin creates the DB session; users discover via presence.
      // =====================================================
      if (isAdmin) {
        try {
          const sessionId = await createCallSession(courseId)
          if (sessionId) {
            console.log(`[VideoCall] Created DB session: ${sessionId}`)
            await manager.signaling.initDurableSignaling(sessionId)
            durableSignalingRef.current = true
            // Update presence to include sessionId so peers discover it
            await manager.signaling.updatePresence({ sessionId })
          }
        } catch (e) {
          console.error('[VideoCall] Failed to create call session:', e)
        }
      } else {
        // Non-admin: check if any existing presence already has sessionId
        const existingPresence = manager.signaling.getPresenceState()
        for (const [, presences] of Object.entries(existingPresence)) {
          for (const p of presences) {
            const ps = p as ParticipantState
            if (ps.sessionId && !durableSignalingRef.current) {
              console.log(`[VideoCall] Discovered session ${ps.sessionId} from presence`)
              await manager.signaling.initDurableSignaling(ps.sessionId)
              durableSignalingRef.current = true
            }
          }
        }
      }
      } catch (e) {
        console.error('[VideoCall] Init error:', e)
      }
    }

    // Notify parent that we're in fullscreen mode
    onFullscreenChangeRef.current?.(true)

    init()

    return () => {
      cancelled = true
      onFullscreenChangeRef.current?.(false)
      if (managerRef.current) {
        managerRef.current.peers.cleanup()
        managerRef.current.signaling.leave()
        managerRef.current = null
      }
      streamInitializedRef.current = false
      initRanRef.current = false
    }
  }, [courseId, isAdmin])

  // Toggle mic
  const handleToggleMic = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return

    const newState = !micActive
    try {
      await manager.toggleMic(newState)
      setMicActive(newState)
      await manager.signaling.updatePresence({
        userId, username, avatarUrl,
        micActive: newState, videoActive, isSpeaking: false,
        screenSharing: isScreenSharing, joinedAt: Date.now(),
      })
    } catch (e) {
      console.error('Toggle mic error:', e)
    }
  }, [micActive, videoActive, isScreenSharing, userId, username, avatarUrl])

  // Toggle video
  const handleToggleVideo = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return

    const newState = !videoActive
    try {
      await manager.toggleVideo(newState)
      setVideoActive(newState)
      await manager.signaling.updatePresence({
        userId, username, avatarUrl,
        micActive, videoActive: newState, isSpeaking: false,
        screenSharing: isScreenSharing, joinedAt: Date.now(),
      })
    } catch (e) {
      console.error('Toggle video error:', e)
    }
  }, [videoActive, micActive, isScreenSharing, userId, username, avatarUrl])

  // Toggle screen share (admin only)
  const handleToggleScreenShare = useCallback(async () => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return

    if (!isScreenSharing) {
      const stream = await manager.startScreenShare()
      if (stream) {
        setScreenStream(stream)
        setIsScreenSharing(true)
        stream.getVideoTracks()[0].onended = async () => {
          setIsScreenSharing(false)
          setScreenStream(null)
          await manager.stopScreenShare()
          await manager.signaling.updatePresence({
            userId, username, avatarUrl,
            micActive, videoActive, isSpeaking: false,
            screenSharing: false, joinedAt: Date.now(),
          })
        }
        await manager.signaling.updatePresence({
          userId, username, avatarUrl,
          micActive, videoActive, isSpeaking: false,
          screenSharing: true, joinedAt: Date.now(),
        })
      }
    } else {
      await manager.stopScreenShare()
      setIsScreenSharing(false)
      setScreenStream(null)
      await manager.signaling.updatePresence({
        userId, username, avatarUrl,
        micActive, videoActive, isSpeaking: false,
        screenSharing: false, joinedAt: Date.now(),
      })
    }
  }, [isScreenSharing, isAdmin, userId, username, avatarUrl, micActive, videoActive])

  const handleMuteAll = useCallback(async () => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return
    await manager.muteAll()
    sileo.success({ title: 'Todos silenciados', description: 'Se silenció a todos los participantes' })
  }, [isAdmin])

  const handleKickUser = useCallback(async (targetUserId: string) => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return
    await manager.kickUser(targetUserId)
  }, [isAdmin])

  const handleEndSession = useCallback(async () => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return
    if (!confirm('¿Finalizar la sesión para todos?')) return
    await manager.endSession()
    // Stop all tracks explicitly before cleanup
    manager.peers.getLocalStreamRef()?.getTracks().forEach(t => t.stop())
    manager.peers.getScreenStreamRef()?.getTracks().forEach(t => t.stop())
    manager.peers.cleanup()
    await manager.signaling.leave()
    onClose()
  }, [isAdmin, onClose])

  const handleLeave = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return
    // Stop all tracks explicitly before cleanup
    manager.peers.getLocalStreamRef()?.getTracks().forEach(t => t.stop())
    manager.peers.getScreenStreamRef()?.getTracks().forEach(t => t.stop())
    manager.peers.cleanup()
    await manager.signaling.leave()
    onClose()
  }, [onClose])

  const handleSendChat = useCallback(async () => {
    const manager = managerRef.current
    if (!manager || !chatMessage.trim()) return
    const msg = {
      userId,
      username,
      text: chatMessage.trim(),
      time: Date.now(),
    }
    await manager.signaling.sendChatMessage(msg)
    setChatMessages(prev => [...prev, msg])
    setChatMessage('')
  }, [chatMessage, userId, username])

  // Effect: discover sessionId from presence for non-admin users who joined
  // before the admin created the session or whose presence sync missed it.
  useEffect(() => {
    const manager = managerRef.current
    if (!manager || durableSignalingRef.current || isAdmin) return

    const sessionIdFromPresence = participants.find(p => p.sessionId)?.sessionId
    if (sessionIdFromPresence) {
      console.log(`[VideoCall] Discovered session ${sessionIdFromPresence} via presence effect`)
      manager.signaling.initDurableSignaling(sessionIdFromPresence).catch((e) => {
        console.error('[VideoCall] Failed to init durable signaling from effect:', e)
      })
      durableSignalingRef.current = true
    }
  }, [participants, isAdmin])

  // Deduplicate participants for display
  const uniqueParticipants = (() => {
    const seen = new Set<string>()
    return participants.filter((p) => {
      if (seen.has(p.userId)) return false
      seen.add(p.userId)
      return true
    })
  })()

  const content = (
    <div className="video-call-overlay">
      {/* Header */}
      <div className="video-call-header">
        <div className="video-call-header-left">
          <div className="video-call-live-badge">
            <span className="live-dot" />
            EN VIVO
          </div>
          <CallTimer />
          <span className="video-call-participant-count">
            {uniqueParticipants.length} participante{uniqueParticipants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button className="video-call-close" onClick={handleLeave} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Salir
        </button>
      </div>

      {/* Main content */}
      <div className="video-call-body">
        <div className="video-call-main">
          <VideoGrid
            localStream={localStream}
            screenStream={screenStream}
            remoteStreams={remoteStreams}
            participants={uniqueParticipants}
            userId={userId}
            isScreenSharing={isScreenSharing || remoteScreenShareUserId !== null}
            isAdmin={isAdmin}
            screenShareUserId={remoteScreenShareUserId}
          />
        </div>

        {showParticipants && (
          <div className="video-call-panel">
            <ParticipantList
              participants={uniqueParticipants}
              currentUserId={userId}
              isAdmin={isAdmin}
              onKick={handleKickUser}
              onClose={() => setShowParticipants(false)}
            />
          </div>
        )}

        {showChat && (
          <div className="video-call-panel video-call-chat-panel">
            <div className="video-call-panel-header">
              <h3>Chat</h3>
              <button onClick={() => setShowChat(false)} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="video-call-chat-messages">
              {chatMessages.length === 0 ? (
                <p className="video-call-chat-empty">No hay mensajes aún</p>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`video-call-chat-msg ${msg.userId === userId ? 'own' : ''}`}>
                    <span className="video-call-chat-msg-name">{msg.username}</span>
                    <p className="video-call-chat-msg-text">{msg.text}</p>
                  </div>
                ))
              )}
            </div>
            <div className="video-call-chat-input">
              <input
                type="text"
                placeholder="Escribí un mensaje..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat() }}
              />
              <button className="video-call-chat-send" onClick={handleSendChat} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <CallControls
        micActive={micActive}
        videoActive={videoActive}
        isScreenSharing={isScreenSharing}
        isAdmin={isAdmin}
        onToggleMic={handleToggleMic}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleParticipants={() => { setShowParticipants(!showParticipants); setShowChat(false) }}
        onToggleChat={() => { setShowChat(!showChat); setShowParticipants(false) }}
        onMuteAll={handleMuteAll}
        onEndSession={handleEndSession}
        onLeave={handleLeave}
        micCount={uniqueParticipants.filter((p) => p.micActive).length}
        videoCount={uniqueParticipants.filter((p) => p.videoActive).length}
      />
    </div>
  )

  // Use Portal to render at document body level, bypassing motion.div transform context
  if (sessionEnded || kicked) {
    return createPortal(
      <div className="video-call-overlay">
        <div className="video-call-ended">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
          <h2>{kicked ? 'Fuiste expulsado' : 'Sesión finalizada'}</h2>
          <p>{kicked ? 'El administrador te expulsó de la sesión' : 'El administrador finalizó la sesión'}</p>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(content, document.body)
}
