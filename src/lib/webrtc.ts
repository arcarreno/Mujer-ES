import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { ActiveSpeakerDetector } from './active-speaker'
import { SilenceSuppressor } from './silence-suppression'
import { ConnectionQualityMonitor, type ConnectionQuality } from './connection-quality'
import { ReconnectionManager, type ReconnectionState } from './reconnection'

// =====================================================
// TYPES
// =====================================================

export interface ParticipantState {
  userId: string
  username: string
  avatarUrl: string | null
  micActive: boolean
  videoActive: boolean
  isSpeaking: boolean
  screenSharing: boolean
  joinedAt: number
  epoch: number // Monotonic epoch to prevent stale leave events
  isAdmin?: boolean // Admin role flag, used to validate privileged control signals
}

export interface RemotePeer {
  userId: string
  username: string
  avatarUrl: string | null
  connection: RTCPeerConnection
  stream: MediaStream | null
  micActive: boolean
  videoActive: boolean
  isSpeaking: boolean
  polite: boolean
}

export type SignalEvent =
  | { type: 'offer'; fromUserId: string; targetUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; fromUserId: string; targetUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; fromUserId: string; targetUserId: string; candidate: RTCIceCandidateInit }
  | { type: 'mute-all'; fromUserId?: string }
  | { type: 'kick'; targetUserId: string; fromUserId?: string }
  | { type: 'end-session'; fromUserId?: string }
  | { type: 'screen-share-started'; fromUserId: string; screenStreamId: string }
  | { type: 'screen-share-stopped'; fromUserId: string }
  | { type: 'track-state'; fromUserId: string; micActive: boolean; videoActive: boolean }

// =====================================================
// LIMITS
// =====================================================

export const MAX_MIC_USERS = 6
export const MAX_VIDEO_USERS = 6

// Sender bitrate caps (bps) to keep encode/decode cheap and the call snappy
const CAMERA_MAX_BITRATE = 1_500_000
const SCREEN_MAX_BITRATE = 4_000_000

// ICE restarts por peer antes de rendirse (evita loops de restart cuando el
// par de candidatos realmente no puede establecerse, p.ej. TURN roto)
const MAX_ICE_RESTARTS = 3

// =====================================================
// COORDINATION HELPERS
// =====================================================

export function getActiveMicCount(presenceState: Record<string, any[]>): number {
  return Object.values(presenceState)
    .flat()
    .filter((p: any) => p.micActive).length
}

export function getActiveVideoCount(presenceState: Record<string, any[]>): number {
  return Object.values(presenceState)
    .flat()
    .filter((p: any) => p.videoActive).length
}

export function canUnmuteMic(presenceState: Record<string, any[]>): boolean {
  return getActiveMicCount(presenceState) < MAX_MIC_USERS
}

export function canEnableVideo(presenceState: Record<string, any[]>): boolean {
  return getActiveVideoCount(presenceState) < MAX_VIDEO_USERS
}

// =====================================================
// RTC CONFIGURATION (W3C §4.2)
// =====================================================

// STUN servers for ICE candidate gathering (necessary for connection establishment)
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

// Optional TURN relay via environment:
//   VITE_TURN_URLS="turn:relay1.expressturn.com:3478?transport=udp,turn:relay1.expressturn.com:3478?transport=tcp,turns:relay1.expressturn.com:443?transport=tcp"
//   VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL (ExpressTURN free: 1 TB/mo, signup at https://www.expressturn.com)
// Empty = STUN-only, which works for most home networks (same LAN or normal NAT).
const TURN_URLS: string[] =
  ((import.meta.env.VITE_TURN_URLS as string | undefined) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? []
const TURN_USERNAME = (import.meta.env.VITE_TURN_USERNAME as string | undefined) ?? ''
const TURN_CREDENTIAL = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) ?? ''

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    ...STUN_SERVERS,
    ...(TURN_URLS.length > 0
      ? [{ urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL }]
      : []),
  ],
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
}

if (TURN_URLS.length === 0 && import.meta.env.MODE !== 'test') {
  console.warn(
    '[WebRTC] Sin TURN relay (solo STUN). Llamadas entre redes distintas (celular ↔ PC, NAT estricto) pueden quedar en NEGRO: configurá VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL (ver .env.example, ExpressTURN free).'
  )
}

// =====================================================
// SIGNALING MANAGER (Dual-Channel: Presence + Per-User Signal)
// =====================================================

export class SignalingManager {
  presenceChannel: RealtimeChannel | null = null
  private courseId: string
  private handlers: {
    onOffer: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void
    onAnswer: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void
    onIceCandidate: (fromUserId: string, candidate: RTCIceCandidateInit) => void
    onMuteAll: (fromUserId?: string) => void
    onKick: (targetUserId: string, fromUserId?: string) => void
    onEndSession: (fromUserId?: string) => void
    onScreenShareStarted: (fromUserId: string, screenStreamId?: string) => void
    onScreenShareStopped: (fromUserId: string) => void
    onTrackState?: (fromUserId: string, micActive: boolean, videoActive: boolean) => void
    onChatMessage?: (msg: { userId: string; username: string; text: string; time: number }) => void
    onPresenceSync: () => void
    onPresenceJoin: (key: string, presence: any) => void
    onPresenceLeave: (key: string, presence: any) => void
  }
  private myUserId: string
  private lastPresenceState: ParticipantState | null = null
  presenceEpochs: Map<string, number> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private lastPresenceData: ParticipantState | null = null
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null
  // Signals que no pudieron enviarse porque el canal no estaba 'joined'
  // (se envían apenas el canal vuelve a conectarse)
  private pendingSignals: SignalEvent[] = []

  constructor(
    courseId: string,
    myUserId: string,
    handlers: typeof SignalingManager.prototype.handlers
  ) {
    this.courseId = courseId
    this.myUserId = myUserId
    this.handlers = handlers
  }

  async join(): Promise<void> {
    this.cancelReconnects()
    this.reconnectAttempts = 0
    if (this.presenceChannel) {
      console.warn('[Signaling] Already joined, cleaning up previous channel')
      await this.leave()
      this.reconnectAttempts = 0
    }
    // Esperar SUBSCRIBED antes de continuar: si el canal no está listo y aun así
    // se envía, Realtime cae al REST fallback y el ICE se pierde.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const ok = await this.setupPresenceChannel()
      if (ok) return
      console.warn(`[Signaling] join() not SUBSCRIBED (attempt ${attempt}/3), recreating channel`)
      if (this.presenceChannel) {
        await supabase.removeChannel(this.presenceChannel)
        this.presenceChannel = null
      }
    }
    console.error('[Signaling] join() failed after 3 attempts')
  }

  private async setupPresenceChannel(): Promise<boolean> {
    this.presenceChannel = supabase.channel(`call:presence:${this.courseId}`, {
      config: {
        presence: { key: this.myUserId },
        // ack: esperar confirmación del servidor (nunca enviar a ciegas)
        // self: false → no recibir eco de los propios broadcasts
        broadcast: { ack: true, self: false },
      },
    })

    // Resolver para que join() espere el estado 'joined' real
    let resolveJoined: ((ok: boolean) => void) | null = null
    const joined = new Promise<boolean>((resolve) => {
      resolveJoined = resolve
    })

    this.presenceChannel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const event = payload as SignalEvent
        // Ignorar eco propio (self:false ya lo evita; doble defensa)
        if (event.fromUserId === this.myUserId) return
        // Canal único: los mensajes p2p (offer/answer/ice/kick) llevan
        // targetUserId — filtrar los dirigidos a otros usuarios
        switch (event.type) {
          case 'offer':
          case 'answer':
          case 'kick':
            if (event.targetUserId !== this.myUserId) return
            break
          case 'ice-candidate':
            if (event.targetUserId && event.targetUserId !== this.myUserId) return
            break
        }
        if (event.type === 'offer') {
          console.log(`[WebRTC] Received offer from ${event.fromUserId}`)
          this.handlers.onOffer(event.fromUserId, event.sdp)
        } else if (event.type === 'answer') {
          console.log(`[WebRTC] Received answer from ${event.fromUserId}`)
          this.handlers.onAnswer(event.fromUserId, event.sdp)
        } else if (event.type === 'ice-candidate') {
          console.log(`[WebRTC] Received ICE candidate from ${event.fromUserId}`)
          this.handlers.onIceCandidate(event.fromUserId, event.candidate)
        } else if (event.type === 'kick') {
          console.log(`[WebRTC] Kick received for ${event.targetUserId} from ${event.fromUserId}`)
          this.handlers.onKick(event.targetUserId, event.fromUserId)
        } else if (event.type === 'mute-all') {
          this.handlers.onMuteAll(event.fromUserId)
        } else if (event.type === 'end-session') {
          this.handlers.onEndSession(event.fromUserId)
        } else if (event.type === 'screen-share-started') {
          this.handlers.onScreenShareStarted(event.fromUserId, event.screenStreamId)
        } else if (event.type === 'screen-share-stopped') {
          this.handlers.onScreenShareStopped(event.fromUserId)
        } else if (event.type === 'track-state') {
          this.handlers.onTrackState?.(event.fromUserId, event.micActive, event.videoActive)
        }
      })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        this.handlers.onChatMessage?.(payload as { userId: string; username: string; text: string; time: number })
      })
      .on('presence', { event: 'sync' }, () => {
        console.log('[Signaling] Presence sync received')
        this.handlers.onPresenceSync()
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const userId = (newPresences[0] as any)?.userId || key
        console.log(`[Signaling] Presence join: ${userId} (key: ${key})`)
        this.handlers.onPresenceJoin(userId, newPresences[0])
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const userId = (leftPresences[0] as any)?.userId || key
        console.log(`[Signaling] Presence leave: ${userId} (key: ${key})`)
        this.handlers.onPresenceLeave(userId, leftPresences[0])
      })
      .subscribe((status) => {
        console.log(`[Signaling] Presence subscribe status: ${status}`)
        if (status === 'SUBSCRIBED') {
          // Despachar señales encoladas mientras el canal no estaba listo
          const pending = this.pendingSignals.splice(0)
          for (const ev of pending) {
            void this.sendSignal(ev)
          }

          // Start stability timer: only reset reconnectAttempts if the channel
          // stays connected for 10s. Without this, a rapid SUBSCRIBED → CLOSED
          // loop keeps resetting attempts to 0, so backoff never accumulates.
          if (this.stableConnectionTimer) {
            clearTimeout(this.stableConnectionTimer)
          }
          this.stableConnectionTimer = setTimeout(() => {
            this.stableConnectionTimer = null
            this.reconnectAttempts = 0
            console.log('[Signaling] Presence channel stable, reset reconnect attempts')
          }, 10000)

          // Track presence with proper epoch increment via trackPresence
          if (this.lastPresenceData) {
            this.trackPresence(this.lastPresenceData)
          }
          resolveJoined?.(true)
          resolveJoined = null
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Cancel stability timer since channel is down
          if (this.stableConnectionTimer) {
            clearTimeout(this.stableConnectionTimer)
            this.stableConnectionTimer = null
          }
          console.warn(`[Signaling] Presence channel lost (${status}), scheduling reconnect...`)
          resolveJoined?.(false)
          resolveJoined = null
          this.scheduleReconnect()
        }
      })

    // Esperar hasta 12s por SUBSCRIBED (websocket + auth). Si el callback nunca
    // llega, join() recrea el canal — jamás seguir sin un canal 'joined'.
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolveJoined = null
        resolve(false)
      }, 12000)
    })
    return Promise.race([joined, timeout])
  }

  async trackPresence(state: ParticipantState): Promise<void> {
    if (!this.presenceChannel) return
    this.lastPresenceData = state
    const currentEpoch = this.presenceEpochs.get(state.userId) || 0
    state.epoch = currentEpoch + 1
    this.presenceEpochs.set(state.userId, state.epoch)
    this.lastPresenceState = state
    await this.presenceChannel.track(state)
  }

  async updatePresence(state: Partial<ParticipantState>): Promise<void> {
    if (!this.presenceChannel) return
    const merged = { ...this.lastPresenceState, ...state } as ParticipantState
    if (this.lastPresenceState) {
      merged.epoch = this.lastPresenceState.epoch
    }
    this.lastPresenceState = merged
    // Sync lastPresenceData so channel reconnects use the latest state
    this.lastPresenceData = merged
    await this.presenceChannel.track(merged)
  }

  getPresenceState(): Record<string, any[]> {
    if (!this.presenceChannel) return {}
    return this.presenceChannel.presenceState()
  }

  async sendSignal(event: SignalEvent): Promise<void> {
    if (!this.presenceChannel) {
      console.error('[Signaling] Cannot send signal: no presence channel')
      return
    }
    const chan = this.presenceChannel
    if (chan.state !== 'joined') {
      // Canal no listo (aún uniéndose o recién reconectado): encolar en vez de
      // enviar — un send() sobre canal no-joined dispara el REST API fallback
      // de Realtime, que pierde candidatos ICE y rompe la negociación.
      console.warn(`[Signaling] Queueing ${event.type} — channel not joined (${chan.state})`)
      if (this.pendingSignals.length < 50) this.pendingSignals.push(event)
      return
    }
    try {
      await chan.send({
        type: 'broadcast',
        event: 'signal',
        payload: event,
      })
    } catch (e) {
      console.error(`[Signaling] send failed for ${event.type}, queueing:`, e)
      if (this.pendingSignals.length < 50) this.pendingSignals.push(event)
    }
  }

  async sendChatMessage(msg: { userId: string; username: string; text: string; time: number }): Promise<void> {
    if (!this.presenceChannel) {
      console.error('[Signaling] Cannot send chat: no presence channel')
      return
    }
    if (this.presenceChannel.state !== 'joined') {
      console.warn('[Signaling] Chat dropped: channel not joined')
      return
    }
    await this.presenceChannel.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: msg,
    })
  }

  async leave(): Promise<void> {
    this.cancelReconnects()
    this.reconnectAttempts = this.maxReconnectAttempts
    this.pendingSignals = []

    if (this.presenceChannel) {
      console.log('[Signaling] Leaving presence channel...')
      await this.presenceChannel.untrack()
      await supabase.removeChannel(this.presenceChannel)
      this.presenceChannel = null
      console.log('[Signaling] Presence channel removed')
    }
  }

  savePresenceData(data: ParticipantState): void {
    this.lastPresenceData = data
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Signaling] Max presence reconnect attempts reached, giving up')
      return
    }
    if (this.reconnectTimer) return

    // Exponential backoff with ±20% jitter to prevent synchronized storms
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000)
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1)
    const delay = Math.round(baseDelay + jitter)
    this.reconnectAttempts++
    console.log(`[Signaling] Reconnecting presence in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        console.log('[Signaling] Attempting presence reconnect...')
        // Remove the old dead channel first
        if (this.presenceChannel) {
          await supabase.removeChannel(this.presenceChannel)
          this.presenceChannel = null
        }
        await this.setupPresenceChannel()
        // Tracking happens in the subscribe callback on SUBSCRIBED — not here.
        // Doing it here races with async subscription and silently fails.
      } catch (e) {
        console.error('[Signaling] Presence reconnect failed:', e)
        this.scheduleReconnect()
      }
    }, delay)
  }

  private cancelReconnects(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer)
      this.stableConnectionTimer = null
    }
  }

  onChatMessage(callback: (msg: { userId: string; username: string; text: string; time: number }) => void): void {
    this.handlers.onChatMessage = callback
  }
}

// =====================================================
// WEBRTC PEER MANAGER (Perfect Negotiation - W3C §10.7)
// =====================================================

export class PeerManager {
  private peers: Map<string, RemotePeer> = new Map()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private signaling: SignalingManager
  private myUserId: string
  private onRemoteStream: ((userId: string, stream: MediaStream) => void)[] = []
  private onRemoteScreenStream: ((userId: string, stream: MediaStream) => void)[] = []
  private onPeerRemoved: ((userId: string) => void) | null = null
  private onScreenShareEnded: (() => void) | null = null
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map()
  private screenSenders: Map<string, RTCRtpSender> = new Map()
  private iceRestartCounts: Map<string, number> = new Map()
  // Screen share routing por SEÑAL EXPLÍCITA: el admin anuncia
  // 'screen-share-started/stopped' por broadcast; acá guardamos qué peers están
  // compartiendo, el composite de su stream de pantalla (video + audio de
  // pestaña) que se muestra en la vista principal, y el MSID (stream id) de ese
  // stream. Los stream-ids SÍ viajan entre peers (a=msid); los track-ids NO
  // (cada navegador genera los suyos), por eso se enruta por stream.
  private remoteScreenActive: Map<string, boolean> = new Map()
  private remoteScreenStreams: Map<string, MediaStream> = new Map()
  private remoteScreenStreamIds: Map<string, string> = new Map()

  // Perfect Negotiation state per peer
  private makingOffer: Map<string, boolean> = new Map()
  private ignoreOffer: Map<string, boolean> = new Map()
  private isSettingRemoteAnswerPending: Map<string, boolean> = new Map()

  constructor(signaling: SignalingManager, myUserId: string, _isAdmin: boolean) {
    this.signaling = signaling
    this.myUserId = myUserId
  }

  setOnRemoteStream(callback: (userId: string, stream: MediaStream) => void): void {
    this.onRemoteStream.push(callback)
  }

  setOnRemoteScreenStream(callback: (userId: string, stream: MediaStream) => void): void {
    this.onRemoteScreenStream.push(callback)
  }

  removeOnRemoteStream(callback: (userId: string, stream: MediaStream) => void): void {
    const idx = this.onRemoteStream.indexOf(callback)
    if (idx !== -1) this.onRemoteStream.splice(idx, 1)
  }

  setOnPeerRemoved(callback: (userId: string) => void): void {
    this.onPeerRemoved = callback
  }

  setOnScreenShareEnded(callback: () => void): void {
    this.onScreenShareEnded = callback
  }

  // The remote user started/stopped sharing their screen (explicit signal).
  // This — NOT msid heuristics — decides whether an incoming video track goes
  // to the camera tile sink or to the main screen view. screenStreamId es el
  // id del MediaStream de getDisplayMedia: los stream-ids se preservan entre
  // peers (a=msid), así que el receptor puede correlacionarlos con ontrack.
  setRemoteScreenShareActive(userId: string, active: boolean, screenStreamId?: string): void {
    if (active) {
      this.remoteScreenActive.set(userId, true)
      if (screenStreamId) {
        this.remoteScreenStreamIds.set(userId, screenStreamId)
      }
    } else {
      this.remoteScreenActive.delete(userId)
      this.remoteScreenStreams.delete(userId)
      this.remoteScreenStreamIds.delete(userId)
    }
  }

  // Routing por stream: true/false si conocemos el stream de pantalla del peer,
  // null si aún no llegó la señal o el evento no trae stream (fallback al
  // comportamiento por kind, clientes viejos / versiones mixtas).
  private isScreenStreamTrack(userId: string, incoming: MediaStream | null): boolean | null {
    const streamId = this.remoteScreenStreamIds.get(userId)
    if (!streamId || !incoming) return null
    return incoming.id === streamId
  }

  // =====================================================
  // LOCAL STREAM MANAGEMENT
  // =====================================================

  async ensureLocalStream(): Promise<MediaStream> {
    if (!this.localStream) {
      console.log('[WebRTC] Requesting camera/mic access...')
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        })
        console.log(`[WebRTC] Got stream: ${this.localStream.getTracks().length} tracks`)
        this.localStream.getTracks().forEach(t => {
          console.log(`[WebRTC]   Track: ${t.kind} - ${t.label} - enabled: ${t.enabled} - readyState: ${t.readyState}`)
        })
      } catch (videoErr) {
        console.warn('[WebRTC] Video+Audio failed:', videoErr)
        // If device not found, skip audio-only fallback (it hangs on devices without media)
        if (videoErr instanceof DOMException && videoErr.name === 'NotFoundError') {
          console.warn('[WebRTC] No media devices found, continuing without camera/mic')
          this.localStream = new MediaStream()
        } else {
          // Other errors (permission denied, etc.) — try audio only
          try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            console.log(`[WebRTC] Got audio-only stream: ${this.localStream.getTracks().length} tracks`)
          } catch (audioErr) {
            console.error('[WebRTC] Audio also failed:', audioErr)
            this.localStream = new MediaStream()
          }
        }
      }
    }
    return this.localStream
  }

  async getScreenStream(): Promise<MediaStream | null> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: { ideal: 30, max: 30 } } as any,
        // audio: true comparte el audio de la pestaña (solo aplica al compartir
        // una pestaña, no ventana/pantalla completa)
        audio: true,
      })
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.screenStream = null
        // Notify that screen share ended (browser native stop button)
        this.onScreenShareEnded?.()
      }
      return this.screenStream
    } catch (e) {
      console.warn('[WebRTC] Screen share failed:', e)
      return null
    }
  }

  async getFullScreenStream(): Promise<MediaStream | null> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: { ideal: 30, max: 30 } } as any,
        audio: true,
      })
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.screenStream = null
        // Notify that screen share ended (browser native stop button)
        this.onScreenShareEnded?.()
      }
      return this.screenStream
    } catch (e) {
      console.warn('[WebRTC] Full screen share failed:', e)
      return null
    }
  }

  stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop())
      this.screenStream = null
    }
  }

  getLocalStreamRef(): MediaStream | null {
    return this.localStream
  }

  getScreenStreamRef(): MediaStream | null {
    return this.screenStream
  }

  // =====================================================
  // PEER CONNECTION (W3C §4.4 + Perfect Negotiation §10.7)
  // =====================================================

  private createPeerConnection(remoteUserId: string, polite: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG)

    // Initialize Perfect Negotiation state for this peer
    this.makingOffer.set(remoteUserId, false)
    this.ignoreOffer.set(remoteUserId, false)
    this.isSettingRemoteAnswerPending.set(remoteUserId, false)

    // Add local tracks (W3C §10.1 — tracks added before offer)
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream!)
      }
      // Cap camera bitrate so encodes stay cheap and the call feels snappy
      this.applySenderConstraints(
        pc.getSenders().find(s => s.track?.kind === 'video'),
        'camera'
      )
    }

    // If screen sharing is active, add the screen tracks (video + audio) as a
    // SEPARATE sender set with their own msid. Never replace the camera sender —
    // the camera keeps transmitting while sharing, so the admin's own video
    // tile never goes gray.
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        const sender = pc.addTrack(track, this.screenStream)
        if (track.kind === 'video') {
          this.screenSenders.set(remoteUserId, sender)
          this.applySenderConstraints(sender, 'screen')
        }
      }
    }

    // ICE candidates → send via signaling
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signaling.sendSignal({
          type: 'ice-candidate',
          fromUserId: this.myUserId,
          targetUserId: remoteUserId,
          candidate: candidate.toJSON(),
        })
      }
    }

    // negotiationneeded → implicit offer (W3C §10.1)
    pc.onnegotiationneeded = async () => {
      // Suppress during explicit offer creation to prevent duplicate offers
      if (this.makingOffer.get(remoteUserId)) return
      try {
        this.makingOffer.set(remoteUserId, true)
        this.ensureOfferHasMSection(pc)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await this.signaling.sendSignal({
          type: 'offer',
          fromUserId: this.myUserId,
          targetUserId: remoteUserId,
          sdp: pc.localDescription!.toJSON(),
        })
      } catch (e) {
        console.error('[WebRTC] negotiationneeded error:', e)
      } finally {
        this.makingOffer.set(remoteUserId, false)
      }
    }

    // ontrack → receive remote tracks.
    // PATRÓN DEL CODELAB OFICIAL DE WEBRTC (firebase-rtc-codelab): acumular
    // TODAS las tracks entrantes en un MediaStream persistente por peer, SIN
    // heurísticas de msid. Safari/iOS reparte audio y video en streams con
    // msids distintos para el mismo origen: deducir "pantalla" o "cámara" por
    // el id del stream hacía que el audio del micrófono se descartara (silencio)
    // o que el VIDEO de la cámara se enrutara como pantalla (tile negro/avatar).
    // El routing de la vista principal lo decide la SEÑAL EXPLÍCITA
    // 'screen-share-started/stopped' (setRemoteScreenShareActive).
    pc.ontrack = ({ track, streams }) => {
      const existing = this.peers.get(remoteUserId)
      if (!existing) return
      console.log(`[WebRTC] ontrack from ${remoteUserId}: kind=${track.kind}, readyState=${track.readyState}`)

      // Screen share ended on the remote: the removed track arrives ended.
      // Clear the stored screen stream so the grid falls back to camera tiles.
      if (track.kind === 'video' && track.readyState === 'ended') {
        console.log(`[WebRTC] Remote screen track ended for ${remoteUserId}`)
        this.remoteScreenStreams.delete(remoteUserId)
        this.remoteScreenActive.delete(remoteUserId)
        this.remoteScreenStreamIds.delete(remoteUserId)
        for (const cb of this.onRemoteScreenStream) {
          cb(remoteUserId, null as unknown as MediaStream)
        }
        return
      }

      const incoming = streams[0] ?? null
      const screenActive = this.remoteScreenActive.get(remoteUserId) === true
      // Por stream-id (msid) si la señal con el stream ya llegó; si no
      // (fallback, versiones mixtas), por kind.
      const routesToScreen = screenActive && (this.isScreenStreamTrack(remoteUserId, incoming) ?? true)
      const sinkHas = (sink: MediaStream | null | undefined, t: MediaStreamTrack): boolean =>
        !!sink && sink.getTracks().some((x) => x.id === t.id)

      // --- SCREEN SHARE ROUTING (solo por señal explícita) ---
      if (routesToScreen && track.kind === 'video') {
        // Un video nuevo mientras el peer está compartiendo = su pantalla.
        let screenComp = this.remoteScreenStreams.get(remoteUserId)
        if (!screenComp) {
          screenComp = new MediaStream()
          this.remoteScreenStreams.set(remoteUserId, screenComp)
        }
        if (!sinkHas(screenComp, track)) screenComp.addTrack(track)
        // Chrome entrega el audio de la pestaña dentro del MISMO objeto stream
        // que el video de pantalla — absorberlo en el composite. El stream de
        // este evento ES el de pantalla por definición de esta rama (id-match o
        // fallback por kind), así que todo su audio es de pestaña, nunca el mic
        // (el mic viaja en el stream de la cámara, por otra m-line).
        if (incoming) {
          for (const t of incoming.getTracks()) {
            if (t.kind === 'audio' && !sinkHas(screenComp, t)) screenComp.addTrack(t)
          }
        }
        console.log(`[WebRTC] Screen stream for ${remoteUserId}: ${screenComp.getTracks().length} tracks`)
        for (const cb of this.onRemoteScreenStream) {
          cb(remoteUserId, screenComp)
        }
        return
      }

      // --- CAMERA SINK (MediaStream persistente por peer) ---
      if (!existing.stream) {
        existing.stream = new MediaStream()
      }
      const sink = existing.stream

      // Audio-only mientras el peer comparte pantalla y la track NO está en el
      // sink de cámara: solo puede ser el audio de la pestaña (el mic ya entró
      // al sink al inicio de la llamada, m-line del mic existe desde antes de
      // compartir). Válido para Chrome (audio+video en el mismo evento) y
      // Safari (audio de pestaña en evento aparte).
      if (routesToScreen && track.kind === 'audio' && !sinkHas(sink, track)) {
        const screenComp = this.remoteScreenStreams.get(remoteUserId) ?? new MediaStream()
        if (!this.remoteScreenStreams.has(remoteUserId)) {
          this.remoteScreenStreams.set(remoteUserId, screenComp)
        }
        if (!sinkHas(screenComp, track)) screenComp.addTrack(track)
        // Entregar a la UI solo cuando ya tiene video: una vista principal
        // solo-audio renderiza negro mientras el video va en camino.
        if (screenComp.getVideoTracks().length > 0) {
          for (const cb of this.onRemoteScreenStream) {
            cb(remoteUserId, screenComp)
          }
        }
        return
      }

      // Absorber TODA track entrante en el sink del tile (codelab: addTrack
      // sobre un remoteStream persistente; los re-eventos son idempotentes).
      if (!sinkHas(sink, track)) sink.addTrack(track)
      if (incoming) {
        for (const t of incoming.getTracks()) {
          if (!sinkHas(sink, t)) sink.addTrack(t)
        }
      }
      console.log(`[WebRTC] Remote stream for ${remoteUserId}: ${sink.getTracks().length} tracks`)
      for (const cb of this.onRemoteStream) {
        cb(remoteUserId, sink)
      }
    }

    // Log ICE candidate gathering failures (STUN/TURN unreachable) — clave
    // para diagnosticar por qué una conexión no se establece
    pc.onicecandidateerror = (ev) => {
      console.warn(
        `[WebRTC] ICE candidate error for ${remoteUserId}: code=${ev.errorCode} text=${ev.errorText}${ev.url ? ` url=${ev.url}` : ''}`
      )
    }

    // ICE connection state → monitor for failure/disconnect and restart
    let iceDisconnectTimer: ReturnType<typeof setTimeout> | null = null
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state for ${remoteUserId}: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === 'failed') {
        if (iceDisconnectTimer) {
          clearTimeout(iceDisconnectTimer)
          iceDisconnectTimer = null
        }
        this.restartIce(remoteUserId, pc)
      } else if (pc.iceConnectionState === 'disconnected') {
        if (!iceDisconnectTimer) {
          iceDisconnectTimer = setTimeout(() => {
            iceDisconnectTimer = null
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              console.warn(`[WebRTC] ICE still disconnected, restarting for ${remoteUserId}`)
              this.restartIce(remoteUserId, pc)
            }
          }, 5000)
        }
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (iceDisconnectTimer) {
          clearTimeout(iceDisconnectTimer)
          iceDisconnectTimer = null
        }
        // Conexión estable: reiniciar el contador de restarts
        this.iceRestartCounts.delete(remoteUserId)
      }
    }

    // Connection state → monitor for stuck 'new' and cleanup on failure
    let newConnectionTimer: ReturnType<typeof setTimeout> | null = null
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state for ${remoteUserId}: ${pc.connectionState}`)
      if (pc.connectionState === 'new') {
        // If stuck in 'new' for 15s, restart ICE
        if (!newConnectionTimer) {
          newConnectionTimer = setTimeout(() => {
            if (pc.connectionState === 'new' || pc.connectionState === 'connecting') {
              console.warn(`[WebRTC] Connection stuck in ${pc.connectionState}, restarting ICE for ${remoteUserId}`)
              this.restartIce(remoteUserId, pc)
            }
            newConnectionTimer = null
          }, 15000)
        }
      } else {
        // Connected or transitioning — cancel the stuck timer
        if (newConnectionTimer) {
          clearTimeout(newConnectionTimer)
          newConnectionTimer = null
        }
      }
      if (pc.connectionState === 'failed') {
        if (newConnectionTimer) {
          clearTimeout(newConnectionTimer)
          newConnectionTimer = null
        }
        // Don't removePeer immediately — iceConnectionState handler already
        // calls restartIce(). Give it 15s (grace) to recover before giving up.
        newConnectionTimer = setTimeout(() => {
          newConnectionTimer = null
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            console.warn(`[WebRTC] Connection still failed after 15s, removing peer ${remoteUserId}`)
            this.removePeer(remoteUserId)
          }
        }, 15000)
      }
    }

    this.peers.set(remoteUserId, {
      userId: remoteUserId,
      username: '',
      avatarUrl: null,
      connection: pc,
      stream: null,
      micActive: false,
      videoActive: false,
      isSpeaking: false,
      polite,
    })

    return pc
  }

  // =====================================================
  // SDP EXCHANGE (Perfect Negotiation - W3C §10.7)
  // =====================================================

  // Guarantee at least one media m-section on the offer.
  // With bundlePolicy: 'max-bundle', an SDP with NO media sections (e.g. when
  // the local stream is an empty MediaStream because no devices/permissions)
  // has no BUNDLE group and setLocalDescription throws:
  //   "Failed to set local offer sdp: max-bundle configured but session
  //    description has no BUNDLE group"
  // Adding real muted transceivers produces genuine media m-lines, so the
  // offer stays valid AND audio/video can still flow from the remote side
  // (recvonly). A dummy data channel would create a data-only call where
  // ontrack never fires — no media reaches anyone.
  private ensureOfferHasMSection(pc: RTCPeerConnection): void {
    let hasMedia = false
    if (typeof (pc as any).getTransceivers === 'function') {
      hasMedia = pc.getTransceivers().length > 0
    }
    if (!hasMedia && typeof (pc as any).getSenders === 'function') {
      hasMedia = (pc as any).getSenders().length > 0
    }
    if (hasMedia) return
    if (pc.signalingState !== 'stable') return
    if (typeof (pc as any).addTransceiver !== 'function') return
    try {
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })
    } catch (e) {
      console.warn('[WebRTC] Failed to add media transceivers:', e)
    }
  }

  // Admin creates offer to new participant
  async createOffer(remoteUserId: string): Promise<void> {
    console.log(`[WebRTC] Creating offer for ${remoteUserId}`)
    console.log(`[WebRTC] Local stream tracks:`, this.localStream?.getTracks().length || 0)
    
    this.removePeer(remoteUserId)

    // Admin is impolite, user is polite
    const pc = this.createPeerConnection(remoteUserId, false)

    // Suppress onnegotiationneeded during explicit offer creation
    this.makingOffer.set(remoteUserId, true)

    try {
      this.ensureOfferHasMSection(pc)

      // Late joiner: re-anunciar la pantalla activa ANTES de la oferta para que
      // el receptor enrute por stream-id (msid) desde el primer frame (audio
      // bugfix). Señal y oferta viajan por el mismo canal, en orden — el
      // receptor registra el stream antes de que llegue la renegociación.
      if (this.screenStream && this.screenStream.getTracks().length > 0) {
        await this.signaling.sendSignal({
          type: 'screen-share-started',
          fromUserId: this.myUserId,
          screenStreamId: this.screenStream.id,
        })
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await this.signaling.sendSignal({
        type: 'offer',
        fromUserId: this.myUserId,
        targetUserId: remoteUserId,
        sdp: pc.localDescription!.toJSON(),
      })
      console.log(`[WebRTC] Offer sent to ${remoteUserId}`)
    } catch (e) {
      console.error('[WebRTC] createOffer error:', e)
    } finally {
      this.makingOffer.set(remoteUserId, false)
    }
  }

  // Handle offer from remote peer (Perfect Negotiation)
  async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    console.log(`[WebRTC] Received offer from ${fromUserId}`)
    const peer = this.peers.get(fromUserId)
    const pc = peer?.connection

    // If no peer exists, create one (user receiving offer from admin)
    if (!pc) {
      console.log(`[WebRTC] Creating new peer connection for ${fromUserId}`)
      const newPc = this.createPeerConnection(fromUserId, true)
      await this.handleOfferWithPc(fromUserId, sdp, newPc)
      return
    }

    await this.handleOfferWithPc(fromUserId, sdp, pc)
  }

  private async handleOfferWithPc(fromUserId: string, sdp: RTCSessionDescriptionInit, pc: RTCPeerConnection): Promise<void> {
    const peer = this.peers.get(fromUserId)
    if (!peer) return

    // Perfect Negotiation: check for glare (W3C §10.7)
    const readyForOffer =
      !this.makingOffer.get(fromUserId) ||
      pc.signalingState === 'stable' ||
      pc.signalingState === 'have-local-pranswer'

    const offerCollision = sdp.type === 'offer' && !readyForOffer

    if (offerCollision) {
      if (!peer.polite) {
        // Impolite peer: ignore the colliding offer
        return
      }
      // Polite peer: rollback and accept the remote offer
      this.ignoreOffer.set(fromUserId, true)
      await pc.setLocalDescription({ type: 'rollback' })
      this.ignoreOffer.set(fromUserId, false)
    }

    try {
      this.isSettingRemoteAnswerPending.set(fromUserId, true)
      await pc.setRemoteDescription(sdp)

      // Flush buffered ICE candidates
      const buffered = this.pendingIceCandidates.get(fromUserId) || []
      this.pendingIceCandidates.delete(fromUserId)
      for (const candidate of buffered) {
        // Skip candidates if we're ignoring this offer
        if (!this.ignoreOffer.get(fromUserId)) {
          await pc.addIceCandidate(candidate)
        }
      }

      // If we received an offer, send an answer
      if (sdp.type === 'offer') {
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await this.signaling.sendSignal({
          type: 'answer',
          fromUserId: this.myUserId,
          targetUserId: fromUserId,
          sdp: pc.localDescription!.toJSON(),
        })
      }
    } catch (e) {
      console.error('[WebRTC] handleOffer error:', e)
    } finally {
      this.isSettingRemoteAnswerPending.set(fromUserId, false)
    }
  }

  // Handle answer from remote peer
  async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromUserId)
    if (!peer) {
      console.warn(`[WebRTC] No peer found for ${fromUserId}`)
      return
    }

    // Guard: ignore duplicate answers — signalingState must be 'have-local-offer'
    // (Supabase broadcasts can replay, causing the same answer to arrive twice)
    if (peer.connection.signalingState !== 'have-local-offer') {
      console.warn(`[WebRTC] Ignoring answer from ${fromUserId} in state ${peer.connection.signalingState}`)
      return
    }

    console.log(`[WebRTC] Received answer from ${fromUserId}`)

    try {
      await peer.connection.setRemoteDescription(sdp)
      console.log(`[WebRTC] Answer set for ${fromUserId}, connection state:`, peer.connection.connectionState)

      // Flush buffered ICE candidates that arrived before the answer
      const buffered = this.pendingIceCandidates.get(fromUserId) || []
      this.pendingIceCandidates.delete(fromUserId)
      for (const candidate of buffered) {
        await peer.connection.addIceCandidate(candidate)
      }
    } catch (e) {
      console.error('[WebRTC] handleAnswer error:', e)
    }
  }

  // Handle ICE candidate (buffer until remote description is set)
  async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromUserId)
    if (!peer) return

    if (peer.connection.remoteDescription) {
      try {
        await peer.connection.addIceCandidate(candidate)
      } catch (e) {
        console.warn('[WebRTC] ICE candidate error:', e)
      }
    } else {
      // Buffer until setRemoteDescription completes
      if (!this.pendingIceCandidates.has(fromUserId)) {
        this.pendingIceCandidates.set(fromUserId, [])
      }
      const buffer = this.pendingIceCandidates.get(fromUserId)!
      // Prevent unbounded buffer growth
      if (buffer.length < 50) {
        buffer.push(candidate)
      } else {
        console.warn('[WebRTC] ICE candidate buffer full, dropping oldest')
        buffer.shift()
        buffer.push(candidate)
      }
    }
  }

  // ICE restart (W3C §4.2.6) — con límite de intentos por peer
  private async restartIce(remoteUserId: string, pc: RTCPeerConnection): Promise<void> {
    const attempts = (this.iceRestartCounts.get(remoteUserId) ?? 0) + 1
    this.iceRestartCounts.set(remoteUserId, attempts)
    if (attempts > MAX_ICE_RESTARTS) {
      console.error(
        `[WebRTC] ICE restart limit reached (${MAX_ICE_RESTARTS}) for ${remoteUserId}, removing peer`
      )
      this.removePeer(remoteUserId)
      return
    }
    console.log(`[WebRTC] ICE restart (${attempts}/${MAX_ICE_RESTARTS}) for ${remoteUserId}`)
    try {
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      await this.signaling.sendSignal({
        type: 'offer',
        fromUserId: this.myUserId,
        targetUserId: remoteUserId,
        sdp: pc.localDescription!.toJSON(),
      })
    } catch (e) {
      console.error('[WebRTC] ICE restart failed:', e)
      this.removePeer(remoteUserId)
    }
  }

  // =====================================================
  // TRACK MANAGEMENT (W3C §5.2)
  // =====================================================

  // Replace track in all peer connections
  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void> {
    for (const [userId, peer] of this.peers) {
      const sender = peer.connection.getSenders().find(s => s.track?.kind === kind)
      if (sender) {
        await sender.replaceTrack(track)
      } else if (track) {
        // No sender found — this shouldn't happen in normal flow
        console.warn(`[WebRTC] No ${kind} sender found for peer ${userId}, skipping addTrack to prevent duplicate`)
      }
    }
  }

  // Add screen stream to all peer connections + trigger renegotiation.
  // Adds the screen tracks (video + audio, own msid) as their OWN senders so
  // the camera sender keeps transmitting side by side. Remote peers then
  // receive two streams: the camera stream (tile) and the screen stream
  // (main view, including tab audio when the browser grants it).
  async addScreenStreamToPeers(): Promise<void> {
    if (!this.screenStream) return
    const tracks = this.screenStream.getTracks()
    if (tracks.length === 0) return

    const operations = Array.from(this.peers.entries()).map(async ([userId, peer]) => {
      // Skip peers that already have the screen sender (idempotent)
      if (this.screenSenders.has(userId)) return
      for (const track of tracks) {
        const sender = peer.connection.addTrack(track, this.screenStream!)
        if (track.kind === 'video') {
          this.screenSenders.set(userId, sender)
          await this.applySenderConstraints(sender, 'screen')
        }
      }
      // Renegociación MANUAL: bloquear onnegotiationneeded durante la creación
      // de esta oferta para que no genere una oferta duplicada (glare) que
      // pueda romper la conexión en una dirección
      this.makingOffer.set(userId, true)
      try {
        const offer = await peer.connection.createOffer()
        await peer.connection.setLocalDescription(offer)
        await this.signaling.sendSignal({
          type: 'offer',
          fromUserId: this.myUserId,
          targetUserId: userId,
          sdp: peer.connection.localDescription!.toJSON(),
        })
      } catch (e) {
        console.warn('[WebRTC] renegotiation after screen share failed:', e)
      } finally {
        this.makingOffer.set(userId, false)
      }
    })

    await Promise.allSettled(operations)
  }

  // Remove screen senders from all peer connections after screen share ends.
  // The camera sender was never replaced, so it just resumes normal video.
  async removeScreenStreamFromPeers(): Promise<void> {
    const screenTrackIds = new Set<string>(
      (this.screenStream?.getTracks() ?? []).map((t) => t.id)
    )
    const operations = Array.from(this.peers.entries()).map(async ([userId, peer]) => {
      // Remove every sender whose track belongs to the screen stream (covers
      // video + audio), even if the stream reference was already cleared.
      const toRemove = peer.connection
        .getSenders()
        .filter((s) => s.track && screenTrackIds.has(s.track.id))
      for (const sender of toRemove) {
        try {
          peer.connection.removeTrack(sender)
        } catch (e) {
          console.warn('[WebRTC] removeTrack failed:', e)
        }
      }
      this.screenSenders.delete(userId)
      // Renegociación MANUAL: bloquear onnegotiationneeded (ver addScreenStreamToPeers)
      this.makingOffer.set(userId, true)
      try {
        const offer = await peer.connection.createOffer()
        await peer.connection.setLocalDescription(offer)
        await this.signaling.sendSignal({
          type: 'offer',
          fromUserId: this.myUserId,
          targetUserId: userId,
          sdp: peer.connection.localDescription!.toJSON(),
        })
      } catch (e) {
        console.warn('[WebRTC] renegotiation after camera restore failed:', e)
      } finally {
        this.makingOffer.set(userId, false)
      }
    })

    await Promise.allSettled(operations)
  }

  // Cap bitrate/framerate on senders so encodes stay cheap (less lag/voice delay)
  private async applySenderConstraints(sender: RTCRtpSender | undefined, kind: 'camera' | 'screen'): Promise<void> {
    if (!sender) return
    try {
      const params = sender.getParameters() as RTCRtpSendParameters
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}]
      }
      params.encodings[0] = {
        ...params.encodings[0],
        maxBitrate: kind === 'screen' ? SCREEN_MAX_BITRATE : CAMERA_MAX_BITRATE,
        maxFramerate: 30,
      }
      params.degradationPreference = kind === 'screen' ? 'maintain-resolution' : 'maintain-framerate'
      await sender.setParameters(params)
    } catch (e) {
      console.warn(`[WebRTC] setParameters failed (${kind} sender):`, e)
    }
  }

  // Toggle mic — just enable/disable track (W3C §5.2)
  async toggleMic(active: boolean): Promise<void> {
    if (!this.localStream) return
    const audioTrack = this.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = active
    }
  }

  // Toggle video — just enable/disable track (W3C §5.2)
  async toggleVideo(active: boolean): Promise<void> {
    if (!this.localStream) return
    const videoTrack = this.localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = active
    }
  }

  // =====================================================
  // PEER MANAGEMENT
  // =====================================================

  removePeer(userId: string): void {
    const peer = this.peers.get(userId)
    if (peer) {
      peer.connection.close()
      this.peers.delete(userId)
      this.pendingIceCandidates.delete(userId)
      this.makingOffer.delete(userId)
      this.ignoreOffer.delete(userId)
      this.isSettingRemoteAnswerPending.delete(userId)
      this.screenSenders.delete(userId)
      this.iceRestartCounts.delete(userId)
      this.remoteScreenActive.delete(userId)
      this.remoteScreenStreams.delete(userId)
      this.remoteScreenStreamIds.delete(userId)
      this.onPeerRemoved?.(userId)
    }
  }

  getPeers(): Map<string, RemotePeer> {
    return this.peers
  }

  cleanup(): void {
    this.peers.forEach((peer) => peer.connection.close())
    this.peers.clear()
    this.pendingIceCandidates.clear()
    this.makingOffer.clear()
    this.ignoreOffer.clear()
    this.isSettingRemoteAnswerPending.clear()
    this.screenSenders.clear()
    this.iceRestartCounts.clear()
    this.remoteScreenActive.clear()
    this.remoteScreenStreams.clear()
    this.remoteScreenStreamIds.clear()
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.screenStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.screenStream = null
  }
}

// =====================================================
// MAIN VIDEO CALL MANAGER
// =====================================================

export class VideoCallManager {
  signaling: SignalingManager
  peers: PeerManager
  activeSpeaker: ActiveSpeakerDetector
  silenceSuppression: SilenceSuppressor
  connectionQuality: ConnectionQualityMonitor
  reconnection: ReconnectionManager
  private myUserId: string
  private isAdmin: boolean
  private adminUserId: string | null = null
  private presenceState: Record<string, any[]> = {}
  private onPresenceUpdate: ((state: Record<string, any[]>) => void) | null = null
  private onUserJoined: ((userId: string) => void) | null = null
  private onUserLeft: ((userId: string) => void) | null = null
  private onActiveSpeaker: ((speakers: { userId: string; level: number; isSpeaking: boolean }[]) => void) | null = null
  private onQualityChange: ((qualities: ConnectionQuality[]) => void) | null = null
  private onReconnectionState: ((state: ReconnectionState, attempt: number) => void) | null = null
  private _handleMuteAll: (() => void) | null = null
  private _handleKick: ((targetUserId: string) => void) | null = null
  private _handleEndSession: (() => void) | null = null
  private _handleScreenShareStarted: ((fromUserId: string) => void) | null = null
  private _handleScreenShareStopped: ((fromUserId: string) => void) | null = null
  private _handleTrackState: ((fromUserId: string, micActive: boolean, videoActive: boolean) => void) | null = null

  constructor(_courseId: string, myUserId: string, isAdmin: boolean) {
    this.myUserId = myUserId
    this.isAdmin = isAdmin

    // Initialize new modules
    this.activeSpeaker = new ActiveSpeakerDetector()
    this.silenceSuppression = new SilenceSuppressor()
    this.connectionQuality = new ConnectionQualityMonitor()
    this.reconnection = new ReconnectionManager()

    // Wire up active speaker detection
    this.activeSpeaker.setCallback((speakers) => {
      this.onActiveSpeaker?.(speakers)
    })

    // Wire up connection quality monitoring
    this.connectionQuality.setCallback((qualities) => {
      this.onQualityChange?.(qualities)
    })

    // Wire up reconnection
    this.reconnection.setCallback((state, attempt) => {
      this.onReconnectionState?.(state, attempt)
    })

    this.signaling = new SignalingManager(_courseId, myUserId, {
      onOffer: (fromUserId, sdp) => {
        // The admin is the one who initiates offers to new participants, so
        // its userId is captured from the first received offer and used to
        // validate privileged control signals (mute-all / kick / end-session).
        if (!this.adminUserId) {
          this.adminUserId = fromUserId
        }
        this.peers.handleOffer(fromUserId, sdp)
      },
      onAnswer: (fromUserId, sdp) => this.peers.handleAnswer(fromUserId, sdp),
      onIceCandidate: (fromUserId, candidate) => this.peers.handleIceCandidate(fromUserId, candidate),
      onMuteAll: (fromUserId) => { if (this.isTrustedSender(fromUserId)) this._handleMuteAll?.() },
      onKick: (targetUserId, fromUserId) => { if (this.isTrustedSender(fromUserId)) this._handleKick?.(targetUserId) },
      onEndSession: (fromUserId) => { if (this.isTrustedSender(fromUserId)) this._handleEndSession?.() },
      onScreenShareStarted: (fromUserId, screenStreamId) => {
        // Enrutar el video de pantalla por SEÑAL + stream-id (msid), no por
        // track-id (los track-ids no viajan entre navegadores)
        this.peers.setRemoteScreenShareActive(fromUserId, true, screenStreamId)
        this._handleScreenShareStarted?.(fromUserId)
      },
      onScreenShareStopped: (fromUserId) => {
        this.peers.setRemoteScreenShareActive(fromUserId, false)
        this._handleScreenShareStopped?.(fromUserId)
      },
      onTrackState: (fromUserId, micActive, videoActive) => this._handleTrackState?.(fromUserId, micActive, videoActive),
      onPresenceSync: () => {
        this.presenceState = this.signaling.getPresenceState()
        this.onPresenceUpdate?.(this.presenceState)
        // El admin debe ofrecer conexión también a quienes ya estaban en la sala
        // cuando él entró: el presence 'sync' es el ÚNICO evento que los lista
        // (su 'join' ya pasó antes de que el admin se suscribiera). Sin esto, el
        // admin ve solo el avatar de los participantes preexistentes.
        // La deduplicación la hace onUserJoined (set offeredUsers en VideoCall).
        if (this.isAdmin) {
          const keys = Object.keys(this.presenceState)
          for (const key of keys) {
            if (key === this.myUserId) continue
            // Pequeño delay para que el trackPresence propio aterrice primero
            setTimeout(() => void this.onUserJoined?.(key), 300)
          }
        }
      },
      onPresenceJoin: (key, presence) => {
        // Skip self-join updates to prevent feedback loops
        if (key !== this.myUserId) {
          // Record the remote user's latest epoch so the stale-leave guard
          // (onPresenceLeave) can tell apart real leaves from presence flaps.
          if (presence?.userId === key || presence?.epoch != null) {
            const epoch = presence?.epoch ?? 0
            const known = this.signaling.presenceEpochs.get(key) || 0
            if (epoch > known) {
              this.signaling.presenceEpochs.set(key, epoch)
            }
          }
          // Derive the admin identity from the presence role flag. Only set it
          // if not already known — never overwrite, so a late joiner claiming
          // isAdmin can't steal the trust anchor (last-writer-wins regression).
          if (presence?.isAdmin && !this.adminUserId) {
            this.adminUserId = key
          }
          // Update participants list so UI shows the new user
          this.onPresenceUpdate?.(this.signaling.getPresenceState())
        }

        if (this.isAdmin && key !== this.myUserId) {
          // Retry offer creation with exponential backoff
          let attempt = 0
          const maxAttempts = 3
          const tryOffer = async () => {
            attempt++
            try {
              await this.onUserJoined?.(key)
            } catch (e) {
              console.warn(`[WebRTC] Offer attempt ${attempt} failed for ${key}:`, e)
              if (attempt < maxAttempts) {
                setTimeout(tryOffer, 500 * attempt)
              }
            }
          }
          setTimeout(tryOffer, 200)
        }
      },
      onPresenceLeave: (key, presence) => {
        if (key !== this.myUserId) {
          // Check epoch to prevent stale leave events from tearing down active connections
          const leaveEpoch = presence?.epoch || 0
          const currentEpoch = this.signaling.presenceEpochs.get(key) || 0
          if (leaveEpoch < currentEpoch) {
            console.warn(`[WebRTC] Ignoring stale leave event for ${key} (epoch ${leaveEpoch} < ${currentEpoch})`)
            return
          }

          // Do NOT destroy the peer connection on presence leave.
          // Supabase Realtime presence frequently flaps (CLOSED → reconnect → CLOSED)
          // during network instability. Destroying peers on presence flaps causes
          // the screen-share black screen and video freeze problems.
          //
          // The WebRTC connection monitors itself via onconnectionstatechange:
          // - 'failed' → peer is removed automatically
          // - ICE restarts on 'disconnected' (5s timer) and 'failed'
          // - Stuck 'new' → ICE restart after 15s
          //
          // Only the participants list is updated — the WebRTC connection stays alive.
          console.log(`[WebRTC] Presence leave for ${key} — keeping peer connection alive (epoch ${leaveEpoch})`)

          // Notify UI that user left so participants list updates
          this.onUserLeft?.(key)
          // Always update participants list via presence state
          this.onPresenceUpdate?.(this.signaling.getPresenceState())
        }
      },
    })

    this.peers = new PeerManager(this.signaling, myUserId, isAdmin)

    // Wire up screen share ended callback to remove screen sender + signal peers
    this.peers.setOnScreenShareEnded(async () => {
      await this.peers.removeScreenStreamFromPeers()
      this.signaling.sendSignal({
        type: 'screen-share-stopped',
        fromUserId: this.myUserId,
      })
    })

    // Wire up active speaker and quality monitoring for new peers
    this.peers.setOnRemoteStream((userId, _stream) => {
      const pc = this.peers.getPeers().get(userId)?.connection
      if (pc) {
        this.activeSpeaker.addPeer(userId, pc)
        this.connectionQuality.addPeer(userId, pc)
      }
    })

    this.peers.setOnPeerRemoved((userId) => {
      this.activeSpeaker.removePeer(userId)
      this.connectionQuality.removePeer(userId)
    })
  }

  async join(): Promise<void> {
    await this.signaling.join()
    // Start active speaker detection and quality monitoring
    this.activeSpeaker.start()
    this.connectionQuality.start()
  }

  // Set up local stream with silence suppression
  async setupLocalStreamWithSuppression(): Promise<MediaStream> {
    const localStream = await this.peers.ensureLocalStream()
    this.activeSpeaker.setLocalStream(localStream)

    // Apply silence suppression to audio
    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      await this.silenceSuppression.start(localStream)
    }

    return localStream
  }

  setOnUserJoined(callback: (userId: string) => void): void {
    this.onUserJoined = callback
  }

  setOnUserLeft(callback: (userId: string) => void): void {
    this.onUserLeft = callback
  }

  setOnActiveSpeaker(callback: (speakers: { userId: string; level: number; isSpeaking: boolean }[]) => void): void {
    this.onActiveSpeaker = callback
  }

  setOnQualityChange(callback: (qualities: ConnectionQuality[]) => void): void {
    this.onQualityChange = callback
  }

  setOnReconnectionState(callback: (state: ReconnectionState, attempt: number) => void): void {
    this.onReconnectionState = callback
  }

  onMuteAll(callback: () => void): void {
    this._handleMuteAll = callback
  }

  onKick(callback: (targetUserId: string) => void): void {
    this._handleKick = callback
  }

  onEndSession(callback: () => void): void {
    this._handleEndSession = callback
  }

  onScreenShareStarted(callback: (fromUserId: string) => void): void {
    this._handleScreenShareStarted = callback
  }

  onScreenShareStopped(callback: (fromUserId: string) => void): void {
    this._handleScreenShareStopped = callback
  }

  onTrackState(callback: (fromUserId: string, micActive: boolean, videoActive: boolean) => void): void {
    this._handleTrackState = callback
  }

  // Broadcast own mic/cam state so everyone's counters update instantly
  // (presence sync also carries it, but slower — broadcast wins for snappiness)
  async broadcastTrackState(micActive: boolean, videoActive: boolean): Promise<void> {
    await this.signaling.sendSignal({
      type: 'track-state',
      fromUserId: this.myUserId,
      micActive,
      videoActive,
    })
  }

  onChatMessage(callback: (msg: { userId: string; username: string; text: string; time: number }) => void): void {
    this.signaling.onChatMessage(callback)
  }

  async toggleMic(active: boolean): Promise<void> {
    await this.peers.toggleMic(active)
  }

  async toggleVideo(active: boolean): Promise<void> {
    await this.peers.toggleVideo(active)
  }

  async startScreenShare(): Promise<MediaStream | null> {
    const stream = await this.peers.getScreenStream()
    if (stream) {
      // Señal ANTES de la renegociación: los peers deben conocer el stream-id
      // de la pantalla (msid) antes de que llegue la oferta (audio bugfix).
      await this.signaling.sendSignal({
        type: 'screen-share-started',
        fromUserId: this.myUserId,
        screenStreamId: stream.id,
      })
      await this.peers.addScreenStreamToPeers()
    }
    return stream
  }

  async startFullScreenShare(): Promise<MediaStream | null> {
    const stream = await this.peers.getFullScreenStream()
    if (stream) {
      // Señal ANTES de la renegociación (ver startScreenShare).
      await this.signaling.sendSignal({
        type: 'screen-share-started',
        fromUserId: this.myUserId,
        screenStreamId: stream.id,
      })
      await this.peers.addScreenStreamToPeers()
    }
    return stream
  }

  async stopScreenShare(): Promise<void> {
    this.signaling.sendSignal({
      type: 'screen-share-stopped',
      fromUserId: this.myUserId,
    })
    this.peers.stopScreenShare()
    await this.peers.removeScreenStreamFromPeers()
  }

  // Best-effort validation of privileged control signals. The admin's userId is
  // captured from the admin's presence join (isAdmin) or the first received
  // offer, set-once. Fail-closed: privileged signals are rejected until an
  // admin anchor is confirmed. Full server-side enforcement (RLS on realtime
  // channels) is out of scope — this only raises the bar against spoofs.
  private isTrustedSender(fromUserId?: string): boolean {
    if (!this.adminUserId) return false
    return !!fromUserId && fromUserId === this.adminUserId
  }

  async muteAll(): Promise<void> {
    if (this.isAdmin) {
      await this.signaling.sendSignal({ type: 'mute-all', fromUserId: this.myUserId })
    }
  }

  async kickUser(targetUserId: string): Promise<void> {
    if (this.isAdmin) {
      await this.signaling.sendSignal({ type: 'kick', targetUserId, fromUserId: this.myUserId })
    }
  }

  async endSession(): Promise<void> {
    if (this.isAdmin) {
      // Single presence broadcast reaches every participant. The previous
      // per-peer "fallback" loop was a no-op: sendSignal routes end-session
      // through the presence channel regardless of targetUserId, so it emitted
      // N identical broadcasts (N× cleanup/leave on every client).
      await this.signaling.sendSignal({ type: 'end-session', fromUserId: this.myUserId })
    }
  }

  getPresenceState(): Record<string, any[]> {
    return this.presenceState
  }

  setOnPresenceUpdate(callback: (state: Record<string, any[]>) => void): void {
    this.onPresenceUpdate = callback
  }

  getParticipantList(): ParticipantState[] {
    const seen = new Set<string>()
    const participants: ParticipantState[] = []
    for (const [, presences] of Object.entries(this.presenceState)) {
      for (const p of presences) {
        const ps = p as ParticipantState
        if (!seen.has(ps.userId)) {
          seen.add(ps.userId)
          participants.push(ps)
        }
      }
    }
    return participants.sort((a, b) => a.joinedAt - b.joinedAt)
  }

  private leaving = false

  async leave(): Promise<void> {
    if (this.leaving) return
    this.leaving = true

    // Stop all monitoring and suppression
    this.activeSpeaker.stop()
    this.connectionQuality.stop()
    this.silenceSuppression.stop()
    this.reconnection.stop()

    // Clean up peers and signaling
    this.peers.cleanup()
    await this.signaling.leave()
  }
}
