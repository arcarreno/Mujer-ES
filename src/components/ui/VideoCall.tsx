import { useState, useEffect, useCallback, useRef } from 'react'
import { sileo } from 'sileo'
import { supabase } from '../../lib/supabase'
import {
  VideoCallManager,
  type ParticipantState,
  MAX_MIC_USERS,
  MAX_VIDEO_USERS,
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
  const [showParticipants, setShowParticipants] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [kicked, setKicked] = useState(false)
  const [ready, setReady] = useState(false)
  const managerRef = useRef<VideoCallManager | null>(null)
  const streamInitializedRef = useRef(false)

  // Initialize
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

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

      // Set up presence update handler
      manager.setOnPresenceUpdate((state) => {
        const list: ParticipantState[] = []
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences) {
            list.push(p as ParticipantState)
          }
        }
        setParticipants(list.sort((a, b) => a.joinedAt - b.joinedAt))
      })

      // Admin: when a new user joins, send them an offer
      if (isAdmin) {
        manager.setOnUserJoined(async (newUserId) => {
          try {
            await manager.peers.createOffer(newUserId)
          } catch (e) {
            console.error('Failed to create offer:', e)
          }
        })
      }

      // Override internal handlers
      ;(manager as any).handleMuteAll = () => {
        setMicActive(false)
        // Disable local audio track
        const stream = manager.peers.getLocalStreamRef()
        if (stream) {
          stream.getAudioTracks().forEach((t) => { t.enabled = false })
        }
        manager.peers.replaceTrack('audio', null)
        sileo.info({ title: 'Silenciado', description: 'El administrador silenció tu micrófono' })
      }

      ;(manager as any).handleKick = (targetUserId: string) => {
        if (targetUserId === user.id) {
          setKicked(true)
          sileo.error({ title: 'Expulsado', description: 'Fuiste expulsado de la sesión' })
          setTimeout(() => onClose(), 2000)
        }
      }

      ;(manager as any).handleEndSession = () => {
        setSessionEnded(true)
        sileo.info({ title: 'Sesión finalizada', description: 'El administrador finalizó la sesión' })
        setTimeout(() => onClose(), 2000)
      }

      // Join signaling channel
      await manager.join()

      // Get local stream early (so tracks are available for peer connections)
      if (!streamInitializedRef.current) {
        streamInitializedRef.current = true
        try {
          const stream = await manager.peers.ensureLocalStream()
          setLocalStream(stream)
          // Start with audio and video enabled
          setMicActive(true)
          setVideoActive(true)
          // Track presence with active states
          await manager.signaling.trackPresence({
            userId: user.id,
            username: uname,
            avatarUrl: aUrl,
            micActive: true,
            videoActive: true,
            isSpeaking: false,
            screenSharing: false,
            joinedAt: Date.now(),
          })
        } catch (e) {
          console.warn('Could not get local stream:', e)
          // Still track presence even without media
          await manager.signaling.trackPresence({
            userId: user.id,
            username: uname,
            avatarUrl: aUrl,
            micActive: false,
            videoActive: false,
            isSpeaking: false,
            screenSharing: false,
            joinedAt: Date.now(),
          })
        }
      }

      setReady(true)
    }

    // Notify parent that we're in fullscreen mode
    onFullscreenChange?.(true)

    init()

    return () => {
      onFullscreenChange?.(false)
      managerRef.current?.leave()
    }
  }, [courseId, isAdmin, onClose, onFullscreenChange])

  // Toggle mic
  const handleToggleMic = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return

    if (!micActive) {
      // Check limit
      const presenceState = manager.signaling.getPresenceState()
      const activeMics = Object.values(presenceState)
        .flat()
        .filter((p: any) => p.micActive && p.userId !== userId).length

      if (activeMics >= MAX_MIC_USERS) {
        sileo.error({
          title: 'Límite alcanzado',
          description: `Máximo ${MAX_MIC_USERS} micrófonos activos. Esperá a que alguien silencie el suyo.`,
        })
        return
      }

      // Enable mic
      const stream = await manager.startMic()
      setLocalStream(stream)
      setMicActive(true)
      // Replace track in existing connections
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        await manager.peers.replaceTrack('audio', audioTrack)
      }
      await manager.signaling.updatePresence({
        userId,
        username,
        avatarUrl,
        micActive: true,
        videoActive,
        isSpeaking: false,
        screenSharing: isScreenSharing,
        joinedAt: Date.now(),
      })
    } else {
      // Disable mic
      await manager.toggleMic(false)
      setMicActive(false)
      await manager.signaling.updatePresence({
        userId,
        username,
        avatarUrl,
        micActive: false,
        videoActive,
        isSpeaking: false,
        screenSharing: isScreenSharing,
        joinedAt: Date.now(),
      })
    }
  }, [micActive, videoActive, isScreenSharing, userId, username, avatarUrl])

  // Toggle video
  const handleToggleVideo = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return

    if (!videoActive) {
      // Check limit
      const presenceState = manager.signaling.getPresenceState()
      const activeVideos = Object.values(presenceState)
        .flat()
        .filter((p: any) => p.videoActive && p.userId !== userId).length

      if (activeVideos >= MAX_VIDEO_USERS) {
        sileo.error({
          title: 'Límite alcanzado',
          description: `Máximo ${MAX_VIDEO_USERS} cámaras activas. Esperá a que alguien apague la suya.`,
        })
        return
      }

      // Enable video
      const stream = await manager.startVideo()
      setLocalStream(stream)
      setVideoActive(true)
      // Replace track in existing connections
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        await manager.peers.replaceTrack('video', videoTrack)
      }
      await manager.signaling.updatePresence({
        userId,
        username,
        avatarUrl,
        micActive,
        videoActive: true,
        isSpeaking: false,
        screenSharing: isScreenSharing,
        joinedAt: Date.now(),
      })
    } else {
      // Disable video
      await manager.toggleVideo(false)
      setVideoActive(false)
      await manager.signaling.updatePresence({
        userId,
        username,
        avatarUrl,
        micActive,
        videoActive: false,
        isSpeaking: false,
        screenSharing: isScreenSharing,
        joinedAt: Date.now(),
      })
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

        // Stop screen when user stops sharing via browser UI
        stream.getVideoTracks()[0].onended = async () => {
          setIsScreenSharing(false)
          setScreenStream(null)
          await manager.stopScreenShare()
          await manager.signaling.updatePresence({
            userId,
            username,
            avatarUrl,
            micActive,
            videoActive,
            isSpeaking: false,
            screenSharing: false,
            joinedAt: Date.now(),
          })
        }

        await manager.signaling.updatePresence({
          userId,
          username,
          avatarUrl,
          micActive,
          videoActive,
          isSpeaking: false,
          screenSharing: true,
          joinedAt: Date.now(),
        })
      }
    } else {
      await manager.stopScreenShare()
      setIsScreenSharing(false)
      setScreenStream(null)
      await manager.signaling.updatePresence({
        userId,
        username,
        avatarUrl,
        micActive,
        videoActive,
        isSpeaking: false,
        screenSharing: false,
        joinedAt: Date.now(),
      })
    }
  }, [isScreenSharing, isAdmin, userId, username, avatarUrl, micActive, videoActive])

  // Mute all (admin)
  const handleMuteAll = useCallback(async () => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return
    await manager.muteAll()
    sileo.success({ title: 'Todos silenciados', description: 'Se silenció a todos los participantes' })
  }, [isAdmin])

  // Kick user (admin)
  const handleKickUser = useCallback(async (targetUserId: string) => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return
    await manager.kickUser(targetUserId)
  }, [isAdmin])

  // End session (admin)
  const handleEndSession = useCallback(async () => {
    const manager = managerRef.current
    if (!manager || !isAdmin) return
    if (!confirm('¿Finalizar la sesión para todos?')) return
    await manager.endSession()
    onClose()
  }, [isAdmin, onClose])

  // Leave call
  const handleLeave = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return
    await manager.leave()
    onClose()
  }, [onClose])

  if (sessionEnded || kicked) {
    return (
      <div className="video-call-overlay">
        <div className="video-call-ended">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
          <h2>{kicked ? 'Fuiste expulsado' : 'Sesión finalizada'}</h2>
          <p>{kicked ? 'El administrador te expulsó de la sesión' : 'El administrador finalizó la sesión'}</p>
        </div>
      </div>
    )
  }

  return (
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
            {participants.length} participante{participants.length !== 1 ? 's' : ''}
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
        {/* Video grid */}
        <div className="video-call-main">
          <VideoGrid
            localStream={localStream}
            screenStream={screenStream}
            remoteStreams={remoteStreams}
            participants={participants}
            userId={userId}
            isScreenSharing={isScreenSharing}
            isAdmin={isAdmin}
          />
        </div>

        {/* Side panels */}
        {showParticipants && (
          <div className="video-call-panel">
            <ParticipantList
              participants={participants}
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
              <p className="video-call-chat-empty">El chat del curso está disponible en la pestaña de Chats</p>
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
        micCount={participants.filter((p) => p.micActive).length}
        videoCount={participants.filter((p) => p.videoActive).length}
      />
    </div>
  )
}
