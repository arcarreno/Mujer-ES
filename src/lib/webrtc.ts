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
// RTC CONFIGURATION
// =====================================================

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

// =====================================================
// SIGNALING MANAGER (Supabase Realtime Broadcast)
// =====================================================

export class SignalingManager {
  private channel: RealtimeChannel | null = null
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

    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const event = payload as SignalEvent

        // Filter: only process signals targeted to me (or broadcasts to all)
        if ('targetUserId' in event && event.targetUserId !== this.myUserId) {
          return // Not for me, ignore
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
      .on('presence', { event: 'sync' }, () => {
        this.handlers.onPresenceSync()
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.handlers.onPresenceJoin(key, newPresences[0])
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.handlers.onPresenceLeave(key, leftPresences[0])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Presence is tracked after subscription
        }
      })
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
}

// =====================================================
// WEBRTC PEER MANAGER (Hub-and-Spoke)
// =====================================================

export class PeerManager {
  private peers: Map<string, RemotePeer> = new Map()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private signaling: SignalingManager
  private myUserId: string
  private onRemoteStream: ((userId: string, stream: MediaStream) => void) | null = null
  private onPeerRemoved: ((userId: string) => void) | null = null

  constructor(
    signaling: SignalingManager,
    myUserId: string,
    _isAdmin: boolean
  ) {
    this.signaling = signaling
    this.myUserId = myUserId
  }

  setOnRemoteStream(callback: (userId: string, stream: MediaStream) => void): void {
    this.onRemoteStream = callback
  }

  setOnPeerRemoved(callback: (userId: string) => void): void {
    this.onPeerRemoved = callback
  }

  // Get or create local stream - called early so tracks are available
  async getLocalStream(constraints: MediaStreamConstraints = { audio: true, video: true }): Promise<MediaStream> {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
    }
    return this.localStream
  }

  // Ensure we have a local stream (create with audio+video if needed)
  async ensureLocalStream(): Promise<MediaStream> {
    if (!this.localStream) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      } catch {
        // Fallback: try audio only
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } catch {
          // No media at all
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

  // Create a peer connection to a remote user
  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG)

    // Add local tracks (even if disabled - we'll replaceTrack later)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!)
      })
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendSignal({
          type: 'ice-candidate',
          fromUserId: this.myUserId,
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const [stream] = event.streams
      const existing = this.peers.get(remoteUserId)
      if (existing) {
        existing.stream = stream
      }
      this.onRemoteStream?.(remoteUserId, stream)
    }

    // Handle connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
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
    })

    return pc
  }

  // Admin: create offer to a new participant
  async createOffer(remoteUserId: string): Promise<void> {
    // Remove existing peer if any
    this.removePeer(remoteUserId)

    const pc = this.createPeerConnection(remoteUserId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.signaling.sendSignal({
      type: 'offer',
      fromUserId: this.myUserId,
      targetUserId: remoteUserId,
      sdp: pc.localDescription!.toJSON(),
    })
  }

  // User: handle offer from admin
  async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    // Remove existing peer if any
    this.removePeer(fromUserId)

    const pc = this.createPeerConnection(fromUserId)
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    await this.signaling.sendSignal({
      type: 'answer',
      fromUserId: this.myUserId,
      targetUserId: fromUserId,
      sdp: pc.localDescription!.toJSON(),
    })
  }

  // Admin: handle answer from participant
  async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromUserId)
    if (peer) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp))
    }
  }

  // Handle ICE candidate
  async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromUserId)
    if (peer) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        // ICE candidate might arrive after connection is established
        console.warn('Failed to add ICE candidate:', e)
      }
    }
  }

  // Replace track in all peer connections (for toggling mic/video)
  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void> {
    for (const [, peer] of this.peers) {
      const sender = peer.connection
        .getSenders()
        .find((s) => s.track?.kind === kind)
      if (sender) {
        await sender.replaceTrack(track)
      }
    }
  }

  // Add screen stream to all peer connections
  async addScreenStreamToPeers(): Promise<void> {
    if (!this.screenStream) return
    const videoTrack = this.screenStream.getVideoTracks()[0]
    if (!videoTrack) return

    for (const [, peer] of this.peers) {
      const sender = peer.connection
        .getSenders()
        .find((s) => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(videoTrack)
      }
    }
  }

  // Restore camera to all peer connections after screen share
  async restoreCameraToPeers(): Promise<void> {
    if (!this.localStream) return
    const videoTrack = this.localStream.getVideoTracks()[0] || null

    for (const [, peer] of this.peers) {
      const sender = peer.connection
        .getSenders()
        .find((s) => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(videoTrack)
      }
    }
  }

  // Toggle mic
  async toggleMic(active: boolean): Promise<void> {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = active
        await this.replaceTrack('audio', active ? audioTrack : null)
      }
    }
  }

  // Toggle video
  async toggleVideo(active: boolean): Promise<void> {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = active
        await this.replaceTrack('video', active ? videoTrack : null)
      }
    }
  }

  removePeer(userId: string): void {
    const peer = this.peers.get(userId)
    if (peer) {
      peer.connection.close()
      this.peers.delete(userId)
      this.onPeerRemoved?.(userId)
    }
  }

  getPeers(): Map<string, RemotePeer> {
    return this.peers
  }

  getScreenStreamRef(): MediaStream | null {
    return this.screenStream
  }

  getLocalStreamRef(): MediaStream | null {
    return this.localStream
  }

  cleanup(): void {
    this.peers.forEach((peer) => peer.connection.close())
    this.peers.clear()
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

  constructor(_courseId: string, myUserId: string, isAdmin: boolean) {
    this.myUserId = myUserId
    this.isAdmin = isAdmin

    this.signaling = new SignalingManager(_courseId, myUserId, {
      onOffer: (fromUserId, sdp) => this.peers.handleOffer(fromUserId, sdp),
      onAnswer: (fromUserId, sdp) => this.peers.handleAnswer(fromUserId, sdp),
      onIceCandidate: (fromUserId, candidate) => this.peers.handleIceCandidate(fromUserId, candidate),
      onMuteAll: () => this.handleMuteAll(),
      onKick: (targetUserId) => this.handleKick(targetUserId),
      onEndSession: () => this.handleEndSession(),
      onScreenShareStarted: () => {},
      onScreenShareStopped: () => {},
      onPresenceSync: () => {
        this.presenceState = this.signaling.getPresenceState()
        this.onPresenceUpdate?.(this.presenceState)
      },
      onPresenceJoin: (key, presence) => {
        // Admin: when a new user joins, send them an offer
        if (this.isAdmin && key !== this.myUserId) {
          // Small delay to let their presence settle
          setTimeout(() => {
            this.onUserJoined?.(key)
          }, 500)
        }
      },
      onPresenceLeave: (key) => {
        // Clean up peer when user leaves
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

  async startMic(): Promise<MediaStream> {
    const stream = await this.peers.getLocalStream({ audio: true, video: false })
    return stream
  }

  async startVideo(): Promise<MediaStream> {
    const stream = await this.peers.getLocalStream({ video: true, audio: false })
    return stream
  }

  async startMicAndVideo(): Promise<MediaStream> {
    const stream = await this.peers.getLocalStream({ audio: true, video: true })
    return stream
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
      // Add screen stream to all peer connections
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
      // Add screen stream to all peer connections
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
    // Restore camera to all peer connections
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

  private handleMuteAll(): void {
    // Override in component to mute local tracks
  }

  private handleKick(_targetUserId: string): void {
    // Override in component to disconnect if kicked
  }

  private handleEndSession(): void {
    // Override in component to close the call
  }

  getPresenceState(): Record<string, any[]> {
    return this.presenceState
  }

  setOnPresenceUpdate(callback: (state: Record<string, any[]>) => void): void {
    this.onPresenceUpdate = callback
  }

  getParticipantList(): ParticipantState[] {
    const participants: ParticipantState[] = []
    for (const [, presences] of Object.entries(this.presenceState)) {
      for (const p of presences) {
        participants.push(p as ParticipantState)
      }
    }
    return participants.sort((a, b) => a.joinedAt - b.joinedAt)
  }

  async leave(): Promise<void> {
    this.peers.cleanup()
    await this.signaling.leave()
  }
}
