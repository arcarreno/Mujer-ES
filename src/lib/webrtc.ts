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
  | { type: 'mute-all' }
  | { type: 'kick'; targetUserId: string }
  | { type: 'end-session' }
  | { type: 'screen-share-started'; fromUserId: string }
  | { type: 'screen-share-stopped'; fromUserId: string }

// =====================================================
// LIMITS
// =====================================================

export const MAX_MIC_USERS = 6
export const MAX_VIDEO_USERS = 6

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

// Privacy mode: force all traffic through TURN relay to hide client IPs
// For a gender violence awareness app, this is a safety-critical option
const RTC_CONFIG_PRIVACY: RTCConfiguration = {
  iceServers: [
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceTransportPolicy: 'relay', // Force TURN relay — hides real IPs
  iceCandidatePoolSize: 2,
  bundlePolicy: 'balanced',
  rtcpMuxPolicy: 'require',
}

// Default to privacy mode for safety
const RTC_CONFIG = RTC_CONFIG_PRIVACY

// =====================================================
// SIGNALING MANAGER (Supabase Realtime Broadcast)
// =====================================================

export class SignalingManager {
  channel: RealtimeChannel | null = null
  private courseId: string
  private handlers: {
    onOffer: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void
    onAnswer: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void
    onIceCandidate: (fromUserId: string, candidate: RTCIceCandidateInit) => void
    onMuteAll: () => void
    onKick: (targetUserId: string) => void
    onEndSession: () => void
    onScreenShareStarted: (fromUserId: string) => void
    onScreenShareStopped: (fromUserId: string) => void
    onChatMessage?: (msg: { userId: string; username: string; text: string; time: number }) => void
    onPresenceSync: () => void
    onPresenceJoin: (key: string, presence: any) => void
    onPresenceLeave: (key: string, presence: any) => void
  }
  private myUserId: string
  private lastPresenceState: ParticipantState | null = null
  presenceEpochs: Map<string, number> = new Map() // Public for epoch checking on leave events

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
    // Prevent double-subscribe
    if (this.channel) {
      console.warn('[Signaling] Already joined, cleaning up previous channel')
      await this.leave()
    }

    // Create channel WITHOUT config to prevent auto-subscribe
    this.channel = supabase.channel(`call:${this.courseId}`)

    // Add ALL handlers BEFORE subscribe (Supabase requirement)
    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const event = payload as SignalEvent
        const from = 'fromUserId' in event ? event.fromUserId : 'unknown'
        const target = 'targetUserId' in event ? event.targetUserId : 'all'
        console.log(`[Signaling] Received broadcast: ${event.type} from=${from} target=${target}`)

        if ('targetUserId' in event && event.targetUserId !== this.myUserId) {
          console.log(`[Signaling] Ignoring signal not for us (for ${event.targetUserId})`)
          return
        }

        if (event.type === 'offer' && 'fromUserId' in event) {
          console.log(`[WebRTC] Received offer from ${event.fromUserId}`)
          this.handlers.onOffer(event.fromUserId, event.sdp)
        } else if (event.type === 'answer' && 'fromUserId' in event) {
          console.log(`[WebRTC] Received answer from ${event.fromUserId}`)
          this.handlers.onAnswer(event.fromUserId, event.sdp)
        } else if (event.type === 'ice-candidate' && 'fromUserId' in event) {
          console.log(`[WebRTC] Received ICE candidate from ${event.fromUserId}`)
          this.handlers.onIceCandidate(event.fromUserId, event.candidate)
        } else if (event.type === 'mute-all') {
          this.handlers.onMuteAll()
        } else if (event.type === 'kick' && 'targetUserId' in event) {
          this.handlers.onKick(event.targetUserId)
        } else if (event.type === 'end-session') {
          this.handlers.onEndSession()
        } else if (event.type === 'screen-share-started' && 'fromUserId' in event) {
          this.handlers.onScreenShareStarted(event.fromUserId)
        } else if (event.type === 'screen-share-stopped' && 'fromUserId' in event) {
          this.handlers.onScreenShareStopped(event.fromUserId)
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
        console.log(`[Signaling] Presence join: ${key}`)
        this.handlers.onPresenceJoin(key, newPresences[0])
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log(`[Signaling] Presence leave: ${key}`)
        this.handlers.onPresenceLeave(key, leftPresences[0])
      })
      .subscribe((status) => {
        console.log(`[Signaling] Subscribe status: ${status}`)
      })
  }

  async trackPresence(state: ParticipantState): Promise<void> {
    if (!this.channel) return
    // Set or increment epoch for this user
    const currentEpoch = this.presenceEpochs.get(state.userId) || 0
    state.epoch = currentEpoch + 1
    this.presenceEpochs.set(state.userId, state.epoch)
    this.lastPresenceState = state
    await this.channel.track(state)
  }

  async updatePresence(state: Partial<ParticipantState>): Promise<void> {
    if (!this.channel) return
    // Merge with last known state to preserve all fields
    const merged = { ...this.lastPresenceState, ...state } as ParticipantState
    // Preserve current epoch
    if (this.lastPresenceState) {
      merged.epoch = this.lastPresenceState.epoch
    }
    this.lastPresenceState = merged
    await this.channel.track(merged)
  }

  getPresenceState(): Record<string, any[]> {
    if (!this.channel) return {}
    return this.channel.presenceState()
  }

  async sendSignal(event: SignalEvent): Promise<void> {
    if (!this.channel) {
      console.error('[Signaling] Cannot send signal: no channel')
      return
    }
    const target = 'targetUserId' in event ? event.targetUserId : 'all'
    console.log(`[Signaling] Sending ${event.type} to ${target}`)
    const status = await this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: event,
    })
    console.log(`[Signaling] Send status: ${status}`)
  }

  async leave(): Promise<void> {
    if (this.channel) {
      console.log('[Signaling] Leaving channel, cleaning up...')
      await this.channel.untrack()
      await supabase.removeChannel(this.channel)
      this.channel = null
      console.log('[Signaling] Channel removed')
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
  private onRemoteStream: ((userId: string, stream: MediaStream) => void) | null = null
  private onPeerRemoved: ((userId: string) => void) | null = null
  private onScreenShareEnded: (() => void) | null = null
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map()

  // Perfect Negotiation state per peer
  private makingOffer: Map<string, boolean> = new Map()
  private ignoreOffer: Map<string, boolean> = new Map()
  private isSettingRemoteAnswerPending: Map<string, boolean> = new Map()

  constructor(signaling: SignalingManager, myUserId: string, _isAdmin: boolean) {
    this.signaling = signaling
    this.myUserId = myUserId
  }

  setOnRemoteStream(callback: (userId: string, stream: MediaStream) => void): void {
    this.onRemoteStream = callback
  }

  setOnPeerRemoved(callback: (userId: string) => void): void {
    this.onPeerRemoved = callback
  }

  setOnScreenShareEnded(callback: () => void): void {
    this.onScreenShareEnded = callback
  }

  // =====================================================
  // LOCAL STREAM MANAGEMENT
  // =====================================================

  async ensureLocalStream(): Promise<MediaStream> {
    if (!this.localStream) {
      console.log('[WebRTC] Requesting camera/mic access...')
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
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
        video: { displaySurface: 'browser' } as any,
        audio: false,
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
        video: { displaySurface: 'monitor' } as any,
        audio: false,
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
    }

    // If screen sharing is active, replace video track
    if (this.screenStream) {
      const screenTrack = this.screenStream.getVideoTracks()[0]
      if (screenTrack) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (videoSender) {
          videoSender.replaceTrack(screenTrack)
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
      try {
        this.makingOffer.set(remoteUserId, true)
        await pc.setLocalDescription()
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

    // ontrack → receive remote stream (W3C §10.1 pattern)
    // FIX: Process track immediately + also handle onunmute for tracks that arrive muted
    pc.ontrack = ({ track, streams }) => {
      console.log(`[WebRTC] ontrack from ${remoteUserId}: kind=${track.kind}, readyState=${track.readyState}`)
      
      const processStream = () => {
        if (streams[0]) {
          const existing = this.peers.get(remoteUserId)
          if (existing && !existing.stream) {
            existing.stream = streams[0]
            console.log(`[WebRTC] Setting remote stream for ${remoteUserId}`)
            this.onRemoteStream?.(remoteUserId, streams[0])
          }
        }
      }

      // Process immediately — onunmute doesn't fire for tracks that arrive already unmuted
      processStream()

      // Also handle unmute events for tracks that arrive muted
      track.onunmute = processStream
    }

    // ICE connection state → monitor for failure and restart (W3C §4.2.6)
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.restartIce(remoteUserId, pc)
      }
    }

    // Connection state → cleanup on permanent failure
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.removePeer(remoteUserId)
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
      await pc.setLocalDescription()
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
        await pc.setLocalDescription()
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
    console.log(`[WebRTC] Received answer from ${fromUserId}`)
    const peer = this.peers.get(fromUserId)
    if (!peer) {
      console.warn(`[WebRTC] No peer found for ${fromUserId}`)
      return
    }

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

  // ICE restart (W3C §4.2.6)
  private async restartIce(remoteUserId: string, pc: RTCPeerConnection): Promise<void> {
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

  // Add screen stream to all peer connections + trigger renegotiation
  async addScreenStreamToPeers(): Promise<void> {
    if (!this.screenStream) return
    const videoTrack = this.screenStream.getVideoTracks()[0]
    if (!videoTrack) return

    const operations = Array.from(this.peers.entries()).map(async ([userId, peer]) => {
      const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(videoTrack)
        // Trigger renegotiation so remote peer's ontrack fires with new track
        try {
          await peer.connection.setLocalDescription()
          await this.signaling.sendSignal({
            type: 'offer',
            fromUserId: this.myUserId,
            targetUserId: userId,
            sdp: peer.connection.localDescription!.toJSON(),
          })
        } catch (e) {
          console.warn('[WebRTC] renegotiation after screen share failed:', e)
        }
      }
    })

    await Promise.allSettled(operations)
  }

  // Restore camera to all peer connections after screen share
  async restoreCameraToPeers(): Promise<void> {
    if (!this.localStream) return
    const videoTrack = this.localStream.getVideoTracks()[0] || null

    const operations = Array.from(this.peers.entries()).map(async ([userId, peer]) => {
      const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(videoTrack)
        // Trigger renegotiation so remote peer's ontrack fires with camera track
        try {
          await peer.connection.setLocalDescription()
          await this.signaling.sendSignal({
            type: 'offer',
            fromUserId: this.myUserId,
            targetUserId: userId,
            sdp: peer.connection.localDescription!.toJSON(),
          })
        } catch (e) {
          console.warn('[WebRTC] renegotiation after camera restore failed:', e)
        }
      }
    })

    await Promise.allSettled(operations)
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
  private presenceState: Record<string, any[]> = {}
  private onPresenceUpdate: ((state: Record<string, any[]>) => void) | null = null
  private onUserJoined: ((userId: string) => void) | null = null
  private onActiveSpeaker: ((speakers: { userId: string; level: number; isSpeaking: boolean }[]) => void) | null = null
  private onQualityChange: ((qualities: ConnectionQuality[]) => void) | null = null
  private onReconnectionState: ((state: ReconnectionState, attempt: number) => void) | null = null
  private _handleMuteAll: (() => void) | null = null
  private _handleKick: ((targetUserId: string) => void) | null = null
  private _handleEndSession: (() => void) | null = null

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
      onOffer: (fromUserId, sdp) => this.peers.handleOffer(fromUserId, sdp),
      onAnswer: (fromUserId, sdp) => this.peers.handleAnswer(fromUserId, sdp),
      onIceCandidate: (fromUserId, candidate) => this.peers.handleIceCandidate(fromUserId, candidate),
      onMuteAll: () => this._handleMuteAll?.(),
      onKick: (targetUserId) => this._handleKick?.(targetUserId),
      onEndSession: () => this._handleEndSession?.(),
      onScreenShareStarted: () => {},
      onScreenShareStopped: () => {},
      onPresenceSync: () => {
        this.presenceState = this.signaling.getPresenceState()
        this.onPresenceUpdate?.(this.presenceState)
      },
      onPresenceJoin: (key, _presence) => {
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
          if (leaveEpoch >= currentEpoch) {
            this.peers.removePeer(key)
          } else {
            console.warn(`[WebRTC] Ignoring stale leave event for ${key} (epoch ${leaveEpoch} < ${currentEpoch})`)
          }
        }
      },
    })

    this.peers = new PeerManager(this.signaling, myUserId, isAdmin)

    // Wire up screen share ended callback to restore camera + signal peers
    this.peers.setOnScreenShareEnded(async () => {
      await this.peers.restoreCameraToPeers()
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
      await this.peers.addScreenStreamToPeers()
      await this.signaling.sendSignal({
        type: 'screen-share-started',
        fromUserId: this.myUserId,
      })
    }
    return stream
  }

  async startFullScreenShare(): Promise<MediaStream | null> {
    const stream = await this.peers.getFullScreenStream()
    if (stream) {
      await this.peers.addScreenStreamToPeers()
      await this.signaling.sendSignal({
        type: 'screen-share-started',
        fromUserId: this.myUserId,
      })
    }
    return stream
  }

  async stopScreenShare(): Promise<void> {
    this.peers.stopScreenShare()
    await this.peers.restoreCameraToPeers()
    this.signaling.sendSignal({
      type: 'screen-share-stopped',
      fromUserId: this.myUserId,
    })
  }

  async muteAll(): Promise<void> {
    if (this.isAdmin) {
      await this.signaling.sendSignal({ type: 'mute-all' })
    }
  }

  async kickUser(targetUserId: string): Promise<void> {
    if (this.isAdmin) {
      await this.signaling.sendSignal({ type: 'kick', targetUserId })
    }
  }

  async endSession(): Promise<void> {
    if (this.isAdmin) {
      await this.signaling.sendSignal({ type: 'end-session' })
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

  async leave(): Promise<void> {
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
