import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: any) => any
  }
}

interface JitsiMeetingRoomProps {
  courseId: string
  accessCode: string
  displayName: string
  isAdmin?: boolean
  onClose: () => void
  onParticipantJoined?: () => void
}

const JITSI_DOMAIN = 'meet.jit.si'
const MAX_PARTICIPANTS = 65

export default function JitsiMeetingRoom({
  courseId,
  accessCode,
  displayName,
  isAdmin = false,
  onClose,
  onParticipantJoined,
}: JitsiMeetingRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<any>(null)
  const passwordSetRef = useRef(false)

  const handleApiReady = useCallback((api: any) => {
    apiRef.current = api

    // Set password when room requires it
    api.addEventListener('passwordRequired', () => {
      if (!passwordSetRef.current) {
        api.executeCommand('password', accessCode)
        passwordSetRef.current = true
      }
    })

    // Auto-mark attendance when participant joins
    api.addEventListener('participantJoined', () => {
      onParticipantJoined?.()
    })

    // Also fire on first videoConferenceJoined (the local user)
    api.addEventListener('videoConferenceJoined', () => {
      onParticipantJoined?.()
      // Ensure password is set for moderator too
      api.getPassword().then((pwd: string | null) => {
        if (!pwd && !passwordSetRef.current) {
          api.executeCommand('password', accessCode)
          passwordSetRef.current = true
        }
      }).catch(() => {
        // getPassword may not be available on public Jitsi
      })
    })

    // Notify when meeting closes
    api.addEventListener('readyToClose', () => {
      onClose()
    })

    api.addEventListener('participantKicked', (event: any) => {
      // Admin kicked someone — no action needed, Jitsi handles it
      console.log('Participant kicked:', event)
    })

    // Set display name
    api.executeCommand('displayName', displayName)
  }, [accessCode, displayName, onClose, onParticipantJoined])

  useEffect(() => {
    // Load Jitsi External API script
    const script = document.createElement('script')
    script.src = `https://${JITSI_DOMAIN}/external_api.js`
    script.async = true
    script.onload = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return

      const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName: `mujeres-${courseId}`,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          maxOccupants: MAX_PARTICIPANTS,
          disableDeepLinking: true,
          prejoinPageEnabled: false,
          disableLobby: false,
          enableInsecureRoomNameWarning: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          SHOW_PROMOTIONAL_PAGE: false,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_DOMINANT_SPEAKER_INDICATOR: false,
          DEFAULT_BACKGROUND: '#1a1c2e',
          TOOLBAR_BUTTONS: [
            'microphone',
            'camera',
            'desktop',
            'chat',
            'raisehand',
            'participants-pane',
            'tileview',
          ],
          ...(isAdmin ? {
            // Admin gets additional moderator controls
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'chat',
              'raisehand',
              'participants-pane',
              'tileview',
              'kick',
              'security',
            ],
          } : {}),
        },
        userInfo: {
          displayName,
        },
      })

      handleApiReady(api)
    }

    document.body.appendChild(script)

    return () => {
      // Cleanup
      apiRef.current?.dispose?.()
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [courseId, handleApiReady, displayName, isAdmin])

  return (
    <div className="jitsi-overlay">
      <div className="jitsi-overlay-header">
        <span className="jitsi-overlay-title">Sesión en vivo</span>
        <button className="jitsi-overlay-close" onClick={onClose} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Salir
        </button>
      </div>
      <div ref={containerRef} className="jitsi-container" />
    </div>
  )
}
