import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

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

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
  iceCandidatePoolSize: 2,
  bundlePolicy: 'balanced',
  rtcpMuxPolicy: 'require',
}

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
    this.channel = supabase.channel(`call:${this.courseId}`, {
      config: {
        presence: { key: this.myUserId },
        broadcast: { self: false },
      },
    })

    // Add ALL handlers BEFORE subscribe (Supabase requirement)
    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const event = payload as SignalEvent

        if ('targetUserId' in event && event.targetUserId !== this.myUserId) {
          return
        }

        if (event.type === 'offer' && 'fromUserId' in event) {
          this.handlers.onOffer(event.fromUserId, event.sdp)
        } else if (event.type === 'answer' && 'fromUserId' in event) {
          this.handlers.onAnswer(event.fromUserId, event.sdp)
        } else if (event.type === 'ice-candidate' && 'fromUserId' in event) {
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
        this.handlers.onPresenceSync()
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.handlers.onPresenceJoin(key, newPresences[0])
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.handlers.onPresenceLeave(key, leftPresences[0])
      })
      .subscribe()
  }

  async trackPresence(state: ParticipantState): Promise<void> {
    if (!this.channel) return
    await this.channel.track(state)
  }

  async updatePresence(state: Partial<ParticipantState>): Promise<void> {
    if (!this.channel) return
    await this.channel.track(state)
  }

  getPresenceState(): Record<string, any[]> {
    if (!this.channel) return {}
    return this.channel.presenceState()
  }

  async sendSignal(event: SignalEvent): Promise<void> {
    if (!this.channel) return
    await this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: event,
    })
  }

  async leave(): Promise<void> {
    if (this.channel) {
      await this.channel.untrack()
      await supabase.removeChannel(this.channel)
      this.channel = null
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

  // =====================================================
  // LOCAL STREAM MANAGEMENT
  // =====================================================

  async ensureLocalStream(): Promise<MediaStream> {
    if (!this.localStream) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      } catch {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } catch {
          this.localStream = new MediaStream()
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
      }
      return this.screenStream
    } catch {
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
      }
      return this.screenStream
    } catch {
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
      const processStream = () => {
        if (streams[0]) {
          const existing = this.peers.get(remoteUserId)
          if (existing && !existing.stream) {
            existing.stream = streams[0]
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
    this.removePeer(remoteUserId)

    // Admin is impolite, user is polite
    const pc = this.createPeerConnection(remoteUserId, false)

    try {
      await pc.setLocalDescription()
      await this.signaling.sendSignal({
        type: 'offer',
        fromUserId: this.myUserId,
        targetUserId: remoteUserId,
        sdp: pc.localDescription!.toJSON(),
      })
    } catch (e) {
      console.error('[WebRTC] createOffer error:', e)
    }
  }

  // Handle offer from remote peer (Perfect Negotiation)
  async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromUserId)
    const pc = peer?.connection

    // If no peer exists, create one (user receiving offer from admin)
    if (!pc) {
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
      !pc.localDescription ||
      pc.signalingState === 'stable' ||
      pc.signalingState === 'have-local-pranswer'

    const offerCollision = sdp.type === 'offer' && !readyForOffer

    if (!peer.polite && offerCollision) {
      // Impolite peer: ignore the colliding offer
      return
    }

    try {
      this.isSettingRemoteAnswerPending.set(fromUserId, true)
      await pc.setRemoteDescription(sdp)
      this.isSettingRemoteAnswerPending.set(fromUserId, false)

      // Flush buffered ICE candidates
      const buffered = this.pendingIceCandidates.get(fromUserId) || []
      this.pendingIceCandidates.delete(fromUserId)
      for (const candidate of buffered) {
        await pc.addIceCandidate(candidate)
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
    }
  }

  // Handle answer from remote peer
  async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromUserId)
    if (!peer) return

    try {
      await peer.connection.setRemoteDescription(sdp)
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
      this.pendingIceCandidates.get(fromUserId)!.push(candidate)
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
    for (const [, peer] of this.peers) {
      const sender = peer.connection.getSenders().find(s => s.track?.kind === kind)
      if (sender) {
        await sender.replaceTrack(track)
      } else if (track && this.localStream) {
        peer.connection.addTrack(track, this.localStream)
      }
    }
  }

  // Add screen stream to all peer connections + trigger renegotiation
  async addScreenStreamToPeers(): Promise<void> {
    if (!this.screenStream) return
    const videoTrack = this.screenStream.getVideoTracks()[0]
    if (!videoTrack) return

    for (const [userId, peer] of this.peers) {
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
    }
  }

  // Restore camera to all peer connections after screen share
  async restoreCameraToPeers(): Promise<void> {
    if (!this.localStream) return
    const videoTrack = this.localStream.getVideoTracks()[0] || null

    for (const [userId, peer] of this.peers) {
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
  private myUserId: string
  private isAdmin: boolean
  private presenceState: Record<string, any[]> = {}
  private onPresenceUpdate: ((state: Record<string, any[]>) => void) | null = null
  private onUserJoined: ((userId: string) => void) | null = null
  private _handleMuteAll: (() => void) | null = null
  private _handleKick: ((targetUserId: string) => void) | null = null
  private _handleEndSession: (() => void) | null = null

  constructor(_courseId: string, myUserId: string, isAdmin: boolean) {
    this.myUserId = myUserId
    this.isAdmin = isAdmin

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
          setTimeout(() => {
            this.onUserJoined?.(key)
          }, 500)
        }
      },
      onPresenceLeave: (key) => {
        if (key !== this.myUserId) {
          this.peers.removePeer(key)
        }
      },
    })

    this.peers = new PeerManager(this.signaling, myUserId, isAdmin)
  }

  async join(): Promise<void> {
    await this.signaling.join()
  }

  setOnUserJoined(callback: (userId: string) => void): void {
    this.onUserJoined = callback
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
    this.peers.cleanup()
    await this.signaling.leave()
  }
}
