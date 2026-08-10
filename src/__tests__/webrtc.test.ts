import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getActiveMicCount,
  getActiveVideoCount,
  canUnmuteMic,
  canEnableVideo,
  MAX_MIC_USERS,
  MAX_VIDEO_USERS,
  PeerManager,
  SignalingManager,
  VideoCallManager,
} from '../lib/webrtc'
import {
  getUserMediaMock,
  getDisplayMediaMock,
  mockSupabase,
  mockPresenceChannel,
  MockMediaStreamTrack,
  MockMediaStream,
} from './setup'

// =====================================================
// Helper: create a mock presence state
// =====================================================
function makePresenceState(entries: { micActive?: boolean; videoActive?: boolean; userId?: string }[] = []) {
  const state: Record<string, any[]> = {}
  entries.forEach((e, i) => {
    const key = e.userId || `user-${i}`
    state[key] = [{ userId: key, micActive: e.micActive ?? false, videoActive: e.videoActive ?? false }]
  })
  return state
}

// =====================================================
// Helper: create a PeerManager with real SignalingManager
// =====================================================
function createRealPeerManager(userId = 'user-1') {
  const signaling = new SignalingManager('course-1', userId, {
    onOffer: vi.fn(),
    onAnswer: vi.fn(),
    onIceCandidate: vi.fn(),
    onMuteAll: vi.fn(),
    onKick: vi.fn(),
    onEndSession: vi.fn(),
    onScreenShareStarted: vi.fn(),
    onScreenShareStopped: vi.fn(),
    onPresenceSync: vi.fn(),
    onPresenceJoin: vi.fn(),
    onPresenceLeave: vi.fn(),
  })
  vi.spyOn(signaling, 'sendSignal').mockResolvedValue(undefined)
  const pm = new PeerManager(signaling, userId, false)
  return { pm, signaling }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// =====================================================
// COORDINATION HELPERS
// =====================================================
describe('getActiveMicCount', () => {
  it('returns 0 for empty state', () => {
    expect(getActiveMicCount({})).toBe(0)
  })

  it('counts users with micActive true', () => {
    const state = makePresenceState([
      { micActive: true },
      { micActive: false },
      { micActive: true },
    ])
    expect(getActiveMicCount(state)).toBe(2)
  })

  it('handles flat array with no entries', () => {
    expect(getActiveMicCount({ room: [] })).toBe(0)
  })

  it('handles multiple rooms', () => {
    const state: Record<string, any[]> = {
      roomA: [{ micActive: true }],
      roomB: [{ micActive: true }, { micActive: true }],
    }
    expect(getActiveMicCount(state)).toBe(3)
  })
})

describe('getActiveVideoCount', () => {
  it('returns 0 for empty state', () => {
    expect(getActiveVideoCount({})).toBe(0)
  })

  it('counts users with videoActive true', () => {
    const state = makePresenceState([
      { videoActive: true },
      { videoActive: false },
      { videoActive: true },
      { videoActive: true },
    ])
    expect(getActiveVideoCount(state)).toBe(3)
  })

  it('handles missing videoActive field as false', () => {
    const state: Record<string, any[]> = {
      room: [{ userId: 'u1' }],
    }
    expect(getActiveVideoCount(state)).toBe(0)
  })
})

describe('canUnmuteMic', () => {
  it('returns true when under limit', () => {
    const state = makePresenceState(Array.from({ length: 5 }, () => ({ micActive: true })))
    expect(canUnmuteMic(state)).toBe(true)
  })

  it('returns false when at limit', () => {
    const state = makePresenceState(Array.from({ length: MAX_MIC_USERS }, () => ({ micActive: true })))
    expect(canUnmuteMic(state)).toBe(false)
  })

  it('returns false when over limit', () => {
    const entries = Array.from({ length: MAX_MIC_USERS + 1 }, () => ({ micActive: true }))
    const state = makePresenceState(entries)
    expect(canUnmuteMic(state)).toBe(false)
  })

  it('returns true when no mics active', () => {
    expect(canUnmuteMic(makePresenceState([{ micActive: false }]))).toBe(true)
  })
})

describe('canEnableVideo', () => {
  it('returns true when under limit', () => {
    const state = makePresenceState(Array.from({ length: 3 }, () => ({ videoActive: true })))
    expect(canEnableVideo(state)).toBe(true)
  })

  it('returns false when at limit', () => {
    const state = makePresenceState(Array.from({ length: MAX_VIDEO_USERS }, () => ({ videoActive: true })))
    expect(canEnableVideo(state)).toBe(false)
  })

  it('returns true when no video active', () => {
    expect(canEnableVideo(makePresenceState([]))).toBe(true)
  })
})

// =====================================================
// PEER MANAGER — ensureLocalStream
// =====================================================
describe('PeerManager.ensureLocalStream', () => {
  it('returns stream with video+audio on success', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    const result = await pm.ensureLocalStream()

    expect(result.getTracks()).toHaveLength(2)
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    })
  })

  it('creates empty stream on NotFoundError (no hang)', async () => {
    const notFoundErr = new DOMException('No device found', 'NotFoundError')
    getUserMediaMock.mockRejectedValueOnce(notFoundErr)

    const { pm } = createRealPeerManager()
    const result = await pm.ensureLocalStream()

    expect(result.getTracks()).toHaveLength(0)
    expect(getUserMediaMock).toHaveBeenCalledTimes(1)
  })

  it('tries audio-only on permission denied', async () => {
    const permErr = new DOMException('Permission denied', 'NotAllowedError')
    const audioTrack = new MockMediaStreamTrack('audio')
    const audioStream = new MockMediaStream([audioTrack])

    getUserMediaMock.mockRejectedValueOnce(permErr)
    getUserMediaMock.mockResolvedValueOnce(audioStream)

    const { pm } = createRealPeerManager()
    const result = await pm.ensureLocalStream()

    expect(getUserMediaMock).toHaveBeenCalledTimes(2)
    expect(getUserMediaMock).toHaveBeenLastCalledWith({ audio: true, video: false })
    expect(result.getAudioTracks()).toHaveLength(1)
  })

  it('creates empty stream when audio also fails', async () => {
    const err = new DOMException('Not allowed', 'NotAllowedError')
    getUserMediaMock.mockRejectedValue(err)

    const { pm } = createRealPeerManager()
    const result = await pm.ensureLocalStream()

    expect(result.getTracks()).toHaveLength(0)
    expect(getUserMediaMock).toHaveBeenCalledTimes(2)
  })

  it('returns cached stream on second call', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const stream = new MockMediaStream([videoTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    const first = await pm.ensureLocalStream()
    const second = await pm.ensureLocalStream()

    expect(first).toBe(second)
    expect(getUserMediaMock).toHaveBeenCalledTimes(1)
  })
})

// =====================================================
// PEER MANAGER — createPeerConnection
// =====================================================
describe('PeerManager.createPeerConnection', () => {
  it('creates RTCPeerConnection with local tracks', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    // Trigger peer creation by handling an offer
    await pm.handleOffer('remote-user', { type: 'offer', sdp: 'v=0\r\n' })

    const peers = pm.getPeers()
    expect(peers.has('remote-user')).toBe(true)
    const peer = peers.get('remote-user')!
    expect(peer.connection).toBeDefined()
    expect(peer.stream).toBeNull()
  })

  it('sets up onicecandidate handler', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('remote-user', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('remote-user')!.connection as any
    expect(pc.onicecandidate).toBeTypeOf('function')
  })

  it('sets up ontrack handler', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('remote-user', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('remote-user')!.connection as any
    expect(pc.ontrack).toBeTypeOf('function')
  })

  it('sets up onnegotiationneeded handler', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('remote-user', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('remote-user')!.connection as any
    expect(pc.onnegotiationneeded).toBeTypeOf('function')
  })

  it('sets up ice connection state change handler', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('remote-user', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('remote-user')!.connection as any
    expect(pc.oniceconnectionstatechange).toBeTypeOf('function')
  })

  it('sets up connection state change handler', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('remote-user', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('remote-user')!.connection as any
    expect(pc.onconnectionstatechange).toBeTypeOf('function')
  })
})

// =====================================================
// PEER MANAGER — createOffer
// =====================================================
describe('PeerManager.createOffer', () => {
  it('creates offer and sends signal', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio'), new MockMediaStreamTrack('video')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm, signaling } = createRealPeerManager()
    await pm.ensureLocalStream()

    await pm.createOffer('target-user')

    expect(signaling.sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'offer',
        fromUserId: 'user-1',
        targetUserId: 'target-user',
      })
    )
  })

  it('removes existing peer before creating new one', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    // Create initial peer
    await pm.handleOffer('target-user', { type: 'offer', sdp: 'v=0\r\n' })
    expect(pm.getPeers().has('target-user')).toBe(true)

    // CreateOffer should remove and recreate
    await pm.createOffer('target-user')
    expect(pm.getPeers().has('target-user')).toBe(true)
  })
})

// =====================================================
// PEER MANAGER — handleOffer
// =====================================================
describe('PeerManager.handleOffer', () => {
  it('creates new peer if none exists', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    expect(pm.getPeers().has('sender-1')).toBe(false)
    await pm.handleOffer('sender-1', { type: 'offer', sdp: 'v=0\r\n' })

    expect(pm.getPeers().has('sender-1')).toBe(true)
    expect(pm.getPeers().get('sender-1')!.polite).toBe(true)
  })

  it('sets remote description and sends answer', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm, signaling } = createRealPeerManager()
    await pm.ensureLocalStream()

    await pm.handleOffer('sender-1', { type: 'offer', sdp: 'v=0\r\n' })

    expect(signaling.sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'answer',
        fromUserId: 'user-1',
        targetUserId: 'sender-1',
      })
    )
  })

  it('flushes buffered ICE candidates', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    // Buffer ICE candidate before offer arrives
    await pm.handleIceCandidate('sender-1', {
      candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    // Now handle offer
    await pm.handleOffer('sender-1', { type: 'offer', sdp: 'v=0\r\n' })

    const peer = pm.getPeers().get('sender-1')!
    const pc = peer.connection as any
    // Buffered candidates should have been flushed (addIceCandidate called)
    expect(pc.remoteDescription).toBeDefined()
  })

  it('handles collision with impolite peer (ignore)', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm, signaling } = createRealPeerManager()
    await pm.ensureLocalStream()

    // Admin creates offer (impolite)
    await pm.createOffer('target-user')
    ;(signaling.sendSignal as any).mockClear()

    // Simulate collision: set makingOffer=true AND signalingState to 'have-local-offer'
    // This simulates the race condition where we're in the middle of creating our offer
    ;(pm as any).makingOffer.set('target-user', true)
    const pc = pm.getPeers().get('target-user')!.connection as any
    pc.signalingState = 'have-local-offer'

    // Incoming offer while makingOffer is true → collision
    await pm.handleOffer('target-user', { type: 'offer', sdp: 'v=0\r\n' })

    // Should NOT send answer since the colliding offer was ignored (impolite peer)
    expect(signaling.sendSignal).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'answer' })
    )
  })
})

// =====================================================
// PEER MANAGER — handleAnswer
// =====================================================
describe('PeerManager.handleAnswer', () => {
  it('sets remote description', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.createOffer('target-user')

    const peer = pm.getPeers().get('target-user')!
    expect(peer.connection.remoteDescription).toBeNull()

    await pm.handleAnswer('target-user', { type: 'answer', sdp: 'v=0\r\n' })
    expect(peer.connection.remoteDescription).toBeDefined()
  })

  it('flushes buffered ICE candidates', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    // Create peer via offer
    await pm.createOffer('target-user')

    // Buffer ICE candidate
    await pm.handleIceCandidate('target-user', {
      candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    // Handle answer
    await pm.handleAnswer('target-user', { type: 'answer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('target-user')!.connection as any
    expect(pc.remoteDescription).toBeDefined()
  })

  it('returns early if no peer found', async () => {
    const { pm } = createRealPeerManager()
    // Should not throw
    await pm.handleAnswer('nonexistent', { type: 'answer', sdp: 'v=0\r\n' })
    expect(pm.getPeers().has('nonexistent')).toBe(false)
  })
})

// =====================================================
// PEER MANAGER — handleIceCandidate
// =====================================================
describe('PeerManager.handleIceCandidate', () => {
  it('adds candidate if remote description is set', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('sender-1', { type: 'offer', sdp: 'v=0\r\n' })

    // Remote description is set after handleOffer, so candidate should be added directly
    const addIceCandidateSpy = vi.spyOn(
      pm.getPeers().get('sender-1')!.connection as any,
      'addIceCandidate'
    )

    await pm.handleIceCandidate('sender-1', {
      candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    expect(addIceCandidateSpy).toHaveBeenCalled()
  })

  it('buffers candidate if remote description not set', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.createOffer('target-user')

    // Before handleAnswer, remoteDescription is null
    // The candidate should be buffered
    await pm.handleIceCandidate('target-user', {
      candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    // No error should occur
    expect(pm.getPeers().has('target-user')).toBe(true)
  })

  it('returns early if peer not found', async () => {
    const { pm } = createRealPeerManager()
    // Should not throw
    await pm.handleIceCandidate('nonexistent', {
      candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })
  })

  it('drops oldest if buffer full (50 limit)', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.createOffer('target-user')

    // Fill buffer with 50 candidates
    for (let i = 0; i < 50; i++) {
      await pm.handleIceCandidate('target-user', {
        candidate: `candidate:${i} 1 udp 2122260223 192.168.1.1 ${50000 + i} typ host`,
        sdpMid: '0',
        sdpMLineIndex: 0,
      })
    }

    // Adding one more should drop oldest
    await pm.handleIceCandidate('target-user', {
      candidate: 'candidate:50 1 udp 2122260223 192.168.1.1 60000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    // Should not throw — oldest was dropped and new one added
    expect(pm.getPeers().has('target-user')).toBe(true)
  })
})

// =====================================================
// PEER MANAGER — removePeer
// =====================================================
describe('PeerManager.removePeer', () => {
  it('closes connection and cleans up state', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('user-to-remove', { type: 'offer', sdp: 'v=0\r\n' })

    expect(pm.getPeers().has('user-to-remove')).toBe(true)
    const pc = pm.getPeers().get('user-to-remove')!.connection as any

    pm.removePeer('user-to-remove')

    expect(pm.getPeers().has('user-to-remove')).toBe(false)
    expect(pc.closed).toBe(true)
  })

  it('calls onPeerRemoved callback', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    const removedCb = vi.fn()
    pm.setOnPeerRemoved(removedCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('user-to-remove', { type: 'offer', sdp: 'v=0\r\n' })

    pm.removePeer('user-to-remove')
    expect(removedCb).toHaveBeenCalledWith('user-to-remove')
  })

  it('does nothing for nonexistent peer', () => {
    const { pm } = createRealPeerManager()
    // Should not throw
    pm.removePeer('nonexistent')
  })
})

// =====================================================
// PEER MANAGER — cleanup
// =====================================================
describe('PeerManager.cleanup', () => {
  it('closes all connections and stops all tracks', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('user-a', { type: 'offer', sdp: 'v=0\r\n' })
    await pm.handleOffer('user-b', { type: 'offer', sdp: 'v=0\r\n' })

    expect(pm.getPeers().size).toBe(2)

    pm.cleanup()

    expect(pm.getPeers().size).toBe(0)
    expect(videoTrack.readyState).toBe('ended')
    expect(audioTrack.readyState).toBe('ended')
  })
})

// =====================================================
// PEER MANAGER — toggleMic / toggleVideo
// =====================================================
describe('PeerManager.toggleMic', () => {
  it('enables audio track', async () => {
    const audioTrack = new MockMediaStreamTrack('audio')
    audioTrack.enabled = false
    const stream = new MockMediaStream([audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    await pm.toggleMic(true)
    expect(audioTrack.enabled).toBe(true)
  })

  it('disables audio track', async () => {
    const audioTrack = new MockMediaStreamTrack('audio')
    audioTrack.enabled = true
    const stream = new MockMediaStream([audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    await pm.toggleMic(false)
    expect(audioTrack.enabled).toBe(false)
  })

  it('does nothing without local stream', async () => {
    const { pm } = createRealPeerManager()
    // No stream yet
    await pm.toggleMic(true)
    // Should not throw
  })
})

describe('PeerManager.toggleVideo', () => {
  it('enables video track', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    videoTrack.enabled = false
    const stream = new MockMediaStream([videoTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    await pm.toggleVideo(true)
    expect(videoTrack.enabled).toBe(true)
  })

  it('disables video track', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const stream = new MockMediaStream([videoTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    await pm.toggleVideo(false)
    expect(videoTrack.enabled).toBe(false)
  })
})

// =====================================================
// PEER MANAGER — replaceTrack
// =====================================================
describe('PeerManager.replaceTrack', () => {
  it('replaces track in all peer connections', async () => {
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    const newTrack = new MockMediaStreamTrack('audio', 'new-audio')
    await pm.replaceTrack('audio', newTrack as any)

    const pc = pm.getPeers().get('peer-1')!.connection as any
    const sender = pc.getSenders().find((s: any) => s.track?.kind === 'audio')
    expect(sender.track).toBe(newTrack)
  })
})

// =====================================================
// PEER MANAGER — addScreenStreamToPeers
// =====================================================
describe('PeerManager.addScreenStreamToPeers', () => {
  it('adds screen track as separate sender and sends offer (camera keeps transmitting)', async () => {
    const videoTrack = new MockMediaStreamTrack('video', 'camera')
    const audioTrack = new MockMediaStreamTrack('audio')
    const camStream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    // Set screen stream
    const screenTrack = new MockMediaStreamTrack('video', 'screen')
    const screenStream = new MockMediaStream([screenTrack])
    ;(pm as any).screenStream = screenStream

    await pm.addScreenStreamToPeers()

    const pc = pm.getPeers().get('peer-1')!.connection as any
    const senders = pc.getSenders()
    const screenSender = senders.find((s: any) => s.track?.label === 'screen')
    const cameraSender = senders.find((s: any) => s.track?.label === 'camera')
    // Screen is a brand-new sender — camera sender still holds the camera track
    expect(screenSender).toBeDefined()
    expect(screenSender.track).toBe(screenTrack)
    expect(cameraSender.track).toBe(videoTrack)
  })

  it('does nothing without screen stream', async () => {
    const { pm } = createRealPeerManager()
    // No screen stream set
    await pm.addScreenStreamToPeers()
    // Should not throw
  })
})

// =====================================================
// PEER MANAGER — removeScreenStreamFromPeers
// =====================================================
describe('PeerManager.removeScreenStreamFromPeers', () => {
  it('removes the screen sender and keeps camera track', async () => {
    const videoTrack = new MockMediaStreamTrack('video', 'camera')
    const audioTrack = new MockMediaStreamTrack('audio')
    const camStream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    // Share screen first
    const screenTrack = new MockMediaStreamTrack('video', 'screen')
    const screenStream = new MockMediaStream([screenTrack])
    ;(pm as any).screenStream = screenStream
    await pm.addScreenStreamToPeers()

    // Stop sharing
    await pm.removeScreenStreamFromPeers()

    const pc = pm.getPeers().get('peer-1')!.connection as any
    const senders = pc.getSenders()
    expect(senders.find((s: any) => s.track?.label === 'screen')).toBeUndefined()
    const cameraSender = senders.find((s: any) => s.track?.kind === 'video')
    expect(cameraSender.track).toBe(videoTrack)
  })

  it('does nothing without screen senders', async () => {
    const { pm } = createRealPeerManager()
    await pm.removeScreenStreamFromPeers()
    // Should not throw
  })
})

// =====================================================
// PEER MANAGER — ontrack callback
// =====================================================
describe('PeerManager ontrack', () => {
  it('sets remote stream and calls onRemoteStream', async () => {
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    const remoteStreamCb = vi.fn()
    pm.setOnRemoteStream(remoteStreamCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('remote-peer')!.connection as any
    const remoteStream = new MockMediaStream([new MockMediaStreamTrack('video', 'remote-video')])

    // Simulate ontrack event
    pc.ontrack({
      track: remoteStream.getVideoTracks()[0],
      streams: [remoteStream],
    })

    // The callback receives the per-peer persistent sink containing that track
    expect(remoteStreamCb).toHaveBeenCalledTimes(1)
    const sink = remoteStreamCb.mock.calls[0][1]
    expect(sink.getVideoTracks()[0]).toBe(remoteStream.getVideoTracks()[0])
  })
})

// =====================================================
// PEER MANAGER — onnegotiationneeded callback
// =====================================================
describe('PeerManager onnegotiationneeded', () => {
  it('creates implicit offer via signaling', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm, signaling } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('peer-1')!.connection as any

    // Trigger negotiationneeded
    await pc.onnegotiationneeded()

    expect(signaling.sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'offer',
        fromUserId: 'user-1',
        targetUserId: 'peer-1',
      })
    )
  })
})

// =====================================================
// PEER MANAGER — ICE connection state change
// =====================================================
describe('PeerManager ICE connection state change', () => {
  it('calls restartIce on failed state', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('peer-1')!.connection as any

    // Should not throw when ice connection fails
    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()
  })
})

// =====================================================
// SIGNALING MANAGER
// =====================================================
describe('SignalingManager', () => {
  it('join creates channel with presence key config', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    await sm.join()

    expect(mockSupabase.channel).toHaveBeenCalledWith(
      'call:presence:course-1',
      expect.objectContaining({
        config: {
          presence: { key: 'user-1' },
          broadcast: { ack: true, self: false },
        },
      })
    )
  })

  it('join cleans up existing channels before creating new', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    await sm.join()
    mockSupabase.channel.mockClear()
    mockSupabase.removeChannel.mockClear()

    await sm.join()

    // The previous presence channel is removed before creating the new one
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('trackPresence sets epoch and calls channel.track', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    const state = {
      userId: 'user-1',
      username: 'Test',
      avatarUrl: null,
      micActive: true,
      videoActive: false,
      isSpeaking: false,
      screenSharing: false,
      joinedAt: Date.now(),
      epoch: 0,
    }

    await sm.trackPresence(state)

    expect(state.epoch).toBe(1)
    expect(mockPresenceChannel.track).toHaveBeenCalledWith(state)
  })

  it('trackPresence increments epoch on subsequent calls', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    const state = {
      userId: 'user-1',
      username: 'Test',
      avatarUrl: null,
      micActive: true,
      videoActive: false,
      isSpeaking: false,
      screenSharing: false,
      joinedAt: Date.now(),
      epoch: 0,
    }

    await sm.trackPresence(state)
    expect(state.epoch).toBe(1)

    await sm.trackPresence(state)
    expect(state.epoch).toBe(2)

    await sm.trackPresence(state)
    expect(state.epoch).toBe(3)
  })

  it('updatePresence merges with last known state', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    const fullState = {
      userId: 'user-1',
      username: 'Test',
      avatarUrl: 'http://avatar.png',
      micActive: true,
      videoActive: true,
      isSpeaking: false,
      screenSharing: false,
      joinedAt: 1000,
      epoch: 1,
    }
    await sm.trackPresence(fullState)

    // Now update partial state
    await sm.updatePresence({ micActive: false })

    // Should have merged micActive=false with the rest of fullState
    expect(mockPresenceChannel.track).toHaveBeenLastCalledWith(
      expect.objectContaining({
        micActive: false,
        videoActive: true,
        username: 'Test',
      })
    )
  })

  it('updatePresence preserves epoch', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    const state = {
      userId: 'user-1',
      username: 'Test',
      avatarUrl: null,
      micActive: true,
      videoActive: false,
      isSpeaking: false,
      screenSharing: false,
      joinedAt: Date.now(),
      epoch: 0,
    }
    await sm.trackPresence(state)
    const epochAfterTrack = state.epoch

    await sm.updatePresence({ micActive: false })

    expect(mockPresenceChannel.track).toHaveBeenLastCalledWith(
      expect.objectContaining({ epoch: epochAfterTrack })
    )
  })

  it('sendSignal sends broadcast with correct event and payload', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    await sm.sendSignal({ type: 'mute-all' })

    expect(mockPresenceChannel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'signal',
      payload: { type: 'mute-all' },
    })
  })

  it('sendSignal logs error if no channel', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    // Don't join — no channel
    await sm.sendSignal({ type: 'mute-all' })

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('leave untracks and removes channels', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    await sm.leave()

    expect(mockPresenceChannel.untrack).toHaveBeenCalled()
    expect(mockSupabase.removeChannel).toHaveBeenCalled()
    expect(sm.presenceChannel).toBeNull()
  })

  it('leave handles null channel gracefully', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    // Never joined — channel is null
    await sm.leave()
    expect(sm.presenceChannel).toBeNull()
  })
})

// =====================================================
// SIGNALING — unified channel (presence carries all signal types)
// =====================================================
describe('SignalingManager unified signal channel', () => {
  const getSignalBroadcastHandler = (): ((args: any) => void) => {
    const call = mockPresenceChannel.on.mock.calls.find(
      (c: any[]) => c[0] === 'broadcast' && c[1]?.event === 'signal'
    )
    return call?.[2]
  }

  it('registers a single broadcast handler (no per-target signal channels)', async () => {
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    await sm.join()

    const signalHandlers = mockPresenceChannel.on.mock.calls.filter(
      (call: any[]) => call[0] === 'broadcast' && call[1]?.event === 'signal'
    )
    expect(signalHandlers).toHaveLength(1)
    expect(getSignalBroadcastHandler()).toBeDefined()
  })

  it('processes offers addressed to me via the presence broadcast', async () => {
    const onOffer = vi.fn()
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer,
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    await sm.join()

    // Simulate receiving an offer from another user (targetUserId = me)
    getSignalBroadcastHandler()({
      payload: {
        type: 'offer',
        fromUserId: 'user-2',
        targetUserId: 'user-1',
        sdp: { type: 'offer', sdp: 'v=0\r\n' },
      },
    })

    expect(onOffer).toHaveBeenCalledWith('user-2', { type: 'offer', sdp: 'v=0\r\n' })
  })

  it('ignores p2p signals addressed to other users', async () => {
    const onOffer = vi.fn()
    const onAnswer = vi.fn()
    const onIceCandidate = vi.fn()
    const onKick = vi.fn()
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer,
      onAnswer,
      onIceCandidate,
      onMuteAll: vi.fn(),
      onKick,
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    await sm.join()

    const handler = getSignalBroadcastHandler()
    handler({
      payload: {
        type: 'offer',
        fromUserId: 'user-2',
        targetUserId: 'user-3',
        sdp: { type: 'offer', sdp: 'v=0\r\n' },
      },
    })
    handler({
      payload: {
        type: 'kick',
        fromUserId: 'user-2',
        targetUserId: 'user-3',
      },
    })

    expect(onOffer).not.toHaveBeenCalled()
    expect(onKick).not.toHaveBeenCalled()
  })

  it('filters self-messages in broadcast', async () => {
    const onOffer = vi.fn()
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer,
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })

    await sm.join()

    getSignalBroadcastHandler()({
      payload: {
        type: 'offer',
        fromUserId: 'user-1',
        targetUserId: 'user-1',
        sdp: { type: 'offer', sdp: 'v=0\r\n' },
      },
    })

    expect(onOffer).not.toHaveBeenCalled()
  })
})

// =====================================================
// SIGNALING — presence handlers
// =====================================================
describe('SignalingManager presence handlers', () => {
  it('calls onPresenceSync on sync event', async () => {
    const onPresenceSync = vi.fn()
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync,
      onPresenceJoin: vi.fn(),
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    const syncHandler = mockPresenceChannel.on.mock.calls.find(
      (call: any[]) => call[0] === 'presence' && call[1]?.event === 'sync'
    )?.[2]

    expect(syncHandler).toBeDefined()
    syncHandler()
    expect(onPresenceSync).toHaveBeenCalled()
  })

  it('calls onPresenceJoin with userId from presence', async () => {
    const onPresenceJoin = vi.fn()
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin,
      onPresenceLeave: vi.fn(),
    })
    await sm.join()

    const joinHandler = mockPresenceChannel.on.mock.calls.find(
      (call: any[]) => call[0] === 'presence' && call[1]?.event === 'join'
    )?.[2]

    joinHandler({
      key: 'user-2',
      newPresences: [{ userId: 'user-2', username: 'Alice' }],
    })

    expect(onPresenceJoin).toHaveBeenCalledWith('user-2', { userId: 'user-2', username: 'Alice' })
  })

  it('calls onPresenceLeave with key', async () => {
    const onPresenceLeave = vi.fn()
    const sm = new SignalingManager('course-1', 'user-1', {
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
      onMuteAll: vi.fn(),
      onKick: vi.fn(),
      onEndSession: vi.fn(),
      onScreenShareStarted: vi.fn(),
      onScreenShareStopped: vi.fn(),
      onPresenceSync: vi.fn(),
      onPresenceJoin: vi.fn(),
      onPresenceLeave,
    })
    await sm.join()

    const leaveHandler = mockPresenceChannel.on.mock.calls.find(
      (call: any[]) => call[0] === 'presence' && call[1]?.event === 'leave'
    )?.[2]

    leaveHandler({ key: 'user-2', leftPresences: [{ userId: 'user-2' }] })
    expect(onPresenceLeave).toHaveBeenCalledWith('user-2', { userId: 'user-2' })
  })
})

// =====================================================
// EDGE CASES / RACE CONDITIONS
// =====================================================
describe('Edge cases', () => {
  it('ICE candidate arrives before remote description', async () => {
    const stream = new MockMediaStream([new MockMediaStreamTrack('audio')])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()

    // Send ICE candidate first (before offer/answer)
    await pm.handleIceCandidate('peer-1', {
      candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    // Now handle offer — should flush the buffered candidate
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    const pc = pm.getPeers().get('peer-1')!.connection as any
    expect(pc.remoteDescription).toBeDefined()
  })

  it('multiple ensureLocalStream calls return same stream', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const stream = new MockMediaStream([videoTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const { pm } = createRealPeerManager()

    const s1 = await pm.ensureLocalStream()
    const s2 = await pm.ensureLocalStream()
    const s3 = await pm.ensureLocalStream()

    expect(s1).toBe(s2)
    expect(s2).toBe(s3)
    expect(getUserMediaMock).toHaveBeenCalledTimes(1)
  })

  it('screen share end triggers camera restore', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const camStream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const screenShareEndedCb = vi.fn()
    pm.setOnScreenShareEnded(screenShareEndedCb)

    await pm.ensureLocalStream()

    // Set up screen stream with onended handler (simulating what getScreenStream does)
    const screenTrack = new MockMediaStreamTrack('video', 'screen')
    const screenStream = new MockMediaStream([screenTrack])
    ;(pm as any).screenStream = screenStream
    // Set the onended handler as getScreenStream would
    screenTrack.onended = () => {
      ;(pm as any).screenStream = null
      screenShareEndedCb()
    }

    // Simulate browser stop
    if (screenTrack.onended) {
      ;(screenTrack.onended as any)()
    }

    expect(screenShareEndedCb).toHaveBeenCalled()
  })
})

// =====================================================
// VIDEOCALL MANAGER INTEGRATION
// =====================================================
describe('VideoCallManager', () => {
  it('joins signaling channel and starts monitoring', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.join()

    expect(mockSupabase.channel).toHaveBeenCalled()
  })

  it('setupLocalStreamWithSuppression returns stream', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const vcm = new VideoCallManager('course-1', 'user-1', false)
    const result = await vcm.setupLocalStreamWithSuppression()

    expect(result).toBe(stream)
  })

  it('toggleMic delegates to peers', async () => {
    const audioTrack = new MockMediaStreamTrack('audio')
    const stream = new MockMediaStream([audioTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.setupLocalStreamWithSuppression()

    await vcm.toggleMic(false)
    expect(audioTrack.enabled).toBe(false)

    await vcm.toggleMic(true)
    expect(audioTrack.enabled).toBe(true)
  })

  it('toggleVideo delegates to peers', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const stream = new MockMediaStream([videoTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.setupLocalStreamWithSuppression()

    await vcm.toggleVideo(false)
    expect(videoTrack.enabled).toBe(false)
  })

  it('startScreenShare returns stream and signals peers', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const camStream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(camStream)

    const screenTrack = new MockMediaStreamTrack('video', 'screen-share')
    const screenStream = new MockMediaStream([screenTrack])
    getDisplayMediaMock.mockResolvedValue(screenStream)

    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.setupLocalStreamWithSuppression()
    await vcm.join()

    const result = await vcm.startScreenShare()
    expect(result).toBe(screenStream)
  })

  it('stopScreenShare restores camera and signals', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const audioTrack = new MockMediaStreamTrack('audio')
    const camStream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(camStream)

    const screenTrack = new MockMediaStreamTrack('video', 'screen-share')
    const screenStream = new MockMediaStream([screenTrack])
    getDisplayMediaMock.mockResolvedValue(screenStream)

    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.setupLocalStreamWithSuppression()
    await vcm.join()
    await vcm.startScreenShare()

    await vcm.stopScreenShare()

    // Camera track should be restored to peers
    expect(vcm.peers.getScreenStreamRef()).toBeNull()
  })

  it('muteAll sends signal only if admin', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', true)
    vi.spyOn(vcm.signaling, 'sendSignal').mockResolvedValue(undefined)
    await vcm.join()

    await vcm.muteAll()

    expect(vcm.signaling.sendSignal).toHaveBeenCalledWith({ type: 'mute-all', fromUserId: 'user-1' })
  })

  it('muteAll does nothing if not admin', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.join()
    vcm.signaling.sendSignal = vi.fn()

    await vcm.muteAll()

    expect(vcm.signaling.sendSignal).not.toHaveBeenCalled()
  })

  it('kickUser sends signal only if admin', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', true)
    vi.spyOn(vcm.signaling, 'sendSignal').mockResolvedValue(undefined)
    await vcm.join()

    await vcm.kickUser('target-user')

    expect(vcm.signaling.sendSignal).toHaveBeenCalledWith({
      type: 'kick',
      targetUserId: 'target-user',
      fromUserId: 'user-1',
    })
  })

  it('endSession sends signal only if admin', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', true)
    vi.spyOn(vcm.signaling, 'sendSignal').mockResolvedValue(undefined)
    await vcm.join()

    await vcm.endSession()

    expect(vcm.signaling.sendSignal).toHaveBeenCalledWith({ type: 'end-session', fromUserId: 'user-1' })
  })

  it('leave cleans up all resources', async () => {
    const videoTrack = new MockMediaStreamTrack('video')
    const stream = new MockMediaStream([videoTrack])
    getUserMediaMock.mockResolvedValue(stream)

    const vcm = new VideoCallManager('course-1', 'user-1', false)
    await vcm.setupLocalStreamWithSuppression()
    await vcm.join()

    await vcm.leave()

    expect(videoTrack.readyState).toBe('ended')
    expect(vcm.peers.getPeers().size).toBe(0)
  })

  it('getParticipantList returns sorted participants', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', false)

    // Manually set presence state
    ;(vcm as any).presenceState = {
      room: [
        { userId: 'user-2', joinedAt: 2000 },
        { userId: 'user-1', joinedAt: 1000 },
        { userId: 'user-3', joinedAt: 500 },
      ],
    }

    const list = vcm.getParticipantList()
    expect(list).toHaveLength(3)
    expect(list[0].userId).toBe('user-3')
    expect(list[1].userId).toBe('user-1')
    expect(list[2].userId).toBe('user-2')
  })

  it('getParticipantList deduplicates by userId', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', false)

    ;(vcm as any).presenceState = {
      roomA: [{ userId: 'user-1', joinedAt: 1000 }],
      roomB: [{ userId: 'user-1', joinedAt: 2000 }],
    }

    const list = vcm.getParticipantList()
    expect(list).toHaveLength(1)
  })
})

// =====================================================
// TWO-USER CALL SIMULATION (admin + participant)
// =====================================================
describe('Two-user call — admin sees participant camera', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  // El canal presence mock es un singleton compartido: los handlers de A y B
  // se registran en el mismo objeto, exactamente como un broadcast real de
  // Supabase. Cada SignalingManager filtra su propio eco (fromUserId === me)
  // y los mensajes dirigidos a otros (targetUserId), así que entregar a TODOS
  // los handlers reproduce fielmente el bus de señalización.
  const signalHandlers = (): ((args: any) => void)[] =>
    mockPresenceChannel.on.mock.calls
      .filter((c: any[]) => c[0] === 'broadcast' && c[1]?.event === 'signal')
      .map((c: any[]) => c[2])

  const syncHandlers = (): ((args?: any) => void)[] =>
    mockPresenceChannel.on.mock.calls
      .filter((c: any[]) => c[0] === 'presence' && c[1]?.event === 'sync')
      .map((c: any[]) => c[2])

  async function setupTwoUserCall() {
    getUserMediaMock.mockImplementation(() =>
      Promise.resolve(
        new MockMediaStream([
          new MockMediaStreamTrack('audio', 'cam-audio'),
          new MockMediaStreamTrack('video', 'cam-video'),
        ])
      )
    )
    mockPresenceChannel.presenceState.mockReturnValue({})

    const admin = new VideoCallManager('course-2u', 'admin-1', true)
    const participant = new VideoCallManager('course-2u', 'user-2', false)

    // Igual que VideoCall.tsx al montar: cada cliente crea su stream local
    // (cámara + micrófono) antes de negociar
    await admin.setupLocalStreamWithSuppression()
    await participant.setupLocalStreamWithSuppression()

    // Bridge: cada sendSignal se entrega a todos los handlers (self-filter dentro)
    for (const c of [admin, participant]) {
      vi.spyOn(c.signaling, 'sendSignal').mockImplementation(async (ev: any) => {
        for (const h of signalHandlers()) h({ payload: ev })
      })
    }
    return { admin, participant }
  }

  const setRoomPresence = () => {
    mockPresenceChannel.presenceState.mockReturnValue({
      'admin-1': [{ userId: 'admin-1', isAdmin: true }],
      'user-2': [{ userId: 'user-2' }],
    })
  }

  it('admin offers to pre-existing participants on presence sync (fix)', async () => {
    const { admin, participant } = await setupTwoUserCall()
    await admin.join()
    await participant.join()
    setRoomPresence()

    const offered: string[] = []
    admin.setOnUserJoined(async (key) => {
      offered.push(key)
      await admin.peers.createOffer(key)
    })

    // El participante YA estaba en la sala cuando el admin entró: el único
    // evento que lo lista es el presence sync (su 'join' ocurrió antes de que
    // el admin se suscribiera). Sin el sweep del sync, el admin jamás ofrece.
    syncHandlers()[0]()

    await sleep(400)

    expect(offered).toContain('user-2')
    expect(offered).not.toContain('admin-1')
    // La negociación completa recorrió el bus: ambos lados quedaron conectados
    expect(admin.peers.getPeers().has('user-2')).toBe(true)
    expect(participant.peers.getPeers().has('admin-1')).toBe(true)
  })

  it('participant never sweeps offers (only admin offers)', async () => {
    const { admin, participant } = await setupTwoUserCall()
    await admin.join()
    await participant.join()
    setRoomPresence()

    const participantOffers: string[] = []
    participant.setOnUserJoined(async (key) => {
      participantOffers.push(key)
      await participant.peers.createOffer(key)
    })

    // Sync dispara el sweep solo en el admin (isAdmin === false en participante)
    for (const h of syncHandlers()) h()
    await sleep(400)

    expect(participantOffers).toHaveLength(0)
    expect(participant.peers.getPeers().has('admin-1')).toBe(false)
  })

  it('participant camera stream reaches admin onRemoteStream after negotiation', async () => {
    const { admin, participant } = await setupTwoUserCall()
    await admin.join()
    await participant.join()
    setRoomPresence()

    const adminRemote: Array<{ user: string; stream: any }> = []
    // Mismo wiring que VideoCall.tsx: los streams remotos se registran en peers
    admin.peers.setOnRemoteStream((userId: string, stream: any) => adminRemote.push({ user: userId, stream }))

    admin.setOnUserJoined(async (key) => {
      await admin.peers.createOffer(key)
    })
    syncHandlers()[0]()
    await sleep(400)

    // Negociación completada por el bus
    const adminPc = admin.peers.getPeers().get('user-2')!.connection as any
    const participantPc = participant.peers.getPeers().get('admin-1')!.connection as any
    expect(adminPc.remoteDescription).toBeDefined()
    expect(participantPc.remoteDescription).toBeDefined()

    // El navegador de la participante envía SU cámara; llega al admin vía ontrack
    const camVideo = participantPc.getSenders().find((s: any) => s.track?.label === 'cam-video')
    const camAudio = participantPc.getSenders().find((s: any) => s.track?.label === 'cam-audio')
    expect(camVideo).toBeDefined()
    expect(camAudio).toBeDefined()
    const camStream = new MockMediaStream([camAudio.track, camVideo.track])

    adminPc.ontrack({ track: camVideo.track, streams: [camStream] })

    expect(adminRemote).toHaveLength(1)
    expect(adminRemote[0].user).toBe('user-2')
    expect(adminRemote[0].stream.getVideoTracks()[0].label).toBe('cam-video')
  })
})

// =====================================================
// SCREEN SHARE — AUDIO TRACKS + ONTRACK ROUTING GUARDS
// =====================================================
describe('Screen share audio + ontrack guards', () => {
  it('adds BOTH video and audio screen senders and keeps camera senders', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    const screenStream = new MockMediaStream([
      new MockMediaStreamTrack('video', 'screen-video'),
      new MockMediaStreamTrack('audio', 'screen-audio'),
    ])
    ;(pm as any).screenStream = screenStream

    await pm.addScreenStreamToPeers()

    const pc = pm.getPeers().get('peer-1')!.connection as any
    const senders = pc.getSenders()
    // Pantalla: video + audio como senders propios
    expect(senders.some((s: any) => s.track?.label === 'screen-video')).toBe(true)
    expect(senders.some((s: any) => s.track?.label === 'screen-audio')).toBe(true)
    // Cámara intacta (nunca se reemplaza el sender)
    expect(senders.some((s: any) => s.track?.label === 'cam-video')).toBe(true)
    expect(senders.some((s: any) => s.track?.label === 'cam-audio')).toBe(true)
  })

  it('removes screen senders by track match (video+audio) and keeps camera', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    const screenStream = new MockMediaStream([
      new MockMediaStreamTrack('video', 'screen-video'),
      new MockMediaStreamTrack('audio', 'screen-audio'),
    ])
    ;(pm as any).screenStream = screenStream
    await pm.addScreenStreamToPeers()

    await pm.removeScreenStreamFromPeers()

    const pc = pm.getPeers().get('peer-1')!.connection as any
    const senders = pc.getSenders()
    expect(senders.some((s: any) => s.track?.label === 'screen-video')).toBe(false)
    expect(senders.some((s: any) => s.track?.label === 'screen-audio')).toBe(false)
    expect(senders.some((s: any) => s.track?.label === 'cam-video')).toBe(true)
    expect(senders.some((s: any) => s.track?.label === 'cam-audio')).toBe(true)
  })

  it('routes screen video ONLY when the screen-share signal is active (signal, not msid)', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const remoteCb = vi.fn()
    const screenCb = vi.fn()
    pm.setOnRemoteStream(remoteCb)
    pm.setOnRemoteScreenStream(screenCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })
    const pc = pm.getPeers().get('remote-peer')!.connection as any

    const remoteCam = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-mic'),
      new MockMediaStreamTrack('video', 'remote-cam-video'),
    ])
    pc.ontrack({ track: remoteCam.getVideoTracks()[0], streams: [remoteCam] })
    expect(remoteCb).toHaveBeenCalledTimes(1)

    // SIN señal de pantalla, un video de OTRO msid es cámara (Safari splitea
    // audio/video en streams distintos): jamás debe ir a la vista principal
    const extraCamVideo = new MockMediaStream([new MockMediaStreamTrack('video', 'remote-cam-video-2')])
    pc.ontrack({ track: extraCamVideo.getVideoTracks()[0], streams: [extraCamVideo] })
    expect(screenCb).not.toHaveBeenCalled()
    expect(remoteCb).toHaveBeenCalledTimes(2)
    expect(pm.getPeers().get('remote-peer')!.stream!.getVideoTracks()).toHaveLength(2)
  })

  it('screen-share signal active: incoming video goes to screen composite (Chrome same-stream audio absorbed)', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const remoteCb = vi.fn()
    const screenCb = vi.fn()
    pm.setOnRemoteStream(remoteCb)
    pm.setOnRemoteScreenStream(screenCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })
    const pc = pm.getPeers().get('remote-peer')!.connection as any

    // La cámara llega primero
    const remoteCam = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-mic'),
      new MockMediaStreamTrack('video', 'remote-cam-video'),
    ])
    pc.ontrack({ track: remoteCam.getVideoTracks()[0], streams: [remoteCam] })
    expect(remoteCb).toHaveBeenCalledTimes(1)

    // El admin anuncia compartir pantalla → la SIGUIENTE señal rutea el video
    pm.setRemoteScreenShareActive('remote-peer', true)
    const screenStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-screen-audio'),
      new MockMediaStreamTrack('video', 'remote-screen-video'),
    ])
    pc.ontrack({ track: screenStream.getVideoTracks()[0], streams: [screenStream] })

    expect(screenCb).toHaveBeenCalledTimes(1)
    const comp = screenCb.mock.calls[0][1]
    // Chrome entrega el audio de pestaña en el MISMO stream que el video
    expect(comp.getVideoTracks()[0].label).toBe('remote-screen-video')
    expect(comp.getAudioTracks()[0].label).toBe('remote-screen-audio')
    // El tile de cámara NO se toca (ni video ni audio de pantalla)
    expect(remoteCb).toHaveBeenCalledTimes(1)
    const sink = pm.getPeers().get('remote-peer')!.stream!
    expect(sink.getVideoTracks()[0].label).toBe('remote-cam-video')
    expect(sink.getAudioTracks()[0].label).toBe('remote-mic')
  })

  it('Safari split streams: audio-only mic arriving after video is added to the camera sink', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const remoteCb = vi.fn()
    const screenCb = vi.fn()
    pm.setOnRemoteStream(remoteCb)
    pm.setOnRemoteScreenStream(screenCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })
    const pc = pm.getPeers().get('remote-peer')!.connection as any

    // Safari: video de cámara SOLO (stream sin audio, msid propio)
    const videoOnly = new MockMediaStream([new MockMediaStreamTrack('video', 'remote-cam-video')])
    pc.ontrack({ track: videoOnly.getVideoTracks()[0], streams: [videoOnly] })
    expect(remoteCb).toHaveBeenCalledTimes(1)

    // Luego el audio del mic llega SOLO (otro stream, otro msid) — antes
    // este caso se DESCARTABA (silencio del usuario) o reemplazaba el tile
    const audioOnly = new MockMediaStream([new MockMediaStreamTrack('audio', 'remote-mic')])
    pc.ontrack({ track: audioOnly.getAudioTracks()[0], streams: [audioOnly] })

    expect(remoteCb).toHaveBeenCalledTimes(2)
    const sink = pm.getPeers().get('remote-peer')!.stream!
    expect(sink.getVideoTracks()[0].label).toBe('remote-cam-video')
    expect(sink.getAudioTracks()[0].label).toBe('remote-mic')
    expect(screenCb).not.toHaveBeenCalled()
  })

  it('tab audio arriving alone goes to the screen composite, never the camera tile', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const remoteCb = vi.fn()
    const screenCb = vi.fn()
    pm.setOnRemoteStream(remoteCb)
    pm.setOnRemoteScreenStream(screenCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })
    const pc = pm.getPeers().get('remote-peer')!.connection as any

    // Cámara + mic primero
    const remoteCam = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-mic'),
      new MockMediaStreamTrack('video', 'remote-cam-video'),
    ])
    pc.ontrack({ track: remoteCam.getVideoTracks()[0], streams: [remoteCam] })

    // Compartiendo pantalla
    pm.setRemoteScreenShareActive('remote-peer', true)
    const screenStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-screen-audio'),
      new MockMediaStreamTrack('video', 'remote-screen-video'),
    ])
    pc.ontrack({ track: screenStream.getVideoTracks()[0], streams: [screenStream] })

    // Safari: el audio de pestaña llega después, SOLO
    const tabAudio = new MockMediaStream([new MockMediaStreamTrack('audio', 'tab-audio')])
    pc.ontrack({ track: tabAudio.getAudioTracks()[0], streams: [tabAudio] })

    // El sink de cámara queda intacto (el mic sigue: sin tab-audio)
    const sink = pm.getPeers().get('remote-peer')!.stream!
    expect(sink.getAudioTracks().some((t: any) => t.label === 'tab-audio')).toBe(false)
    expect(sink.getAudioTracks()[0].label).toBe('remote-mic')
    // El composite de pantalla recibe el audio de pestaña y se re-emite
    expect(screenCb).toHaveBeenCalledTimes(2)
    const comp = screenCb.mock.calls[1][1]
    expect(comp.getVideoTracks()[0].label).toBe('remote-screen-video')
    expect(comp.getAudioTracks().some((t: any) => t.label === 'tab-audio')).toBe(true)
  })

  it('audio-only screen composite is not delivered until it has video (no black main view)', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const remoteCb = vi.fn()
    const screenCb = vi.fn()
    pm.setOnRemoteStream(remoteCb)
    pm.setOnRemoteScreenStream(screenCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })
    const pc = pm.getPeers().get('remote-peer')!.connection as any

    const remoteCam = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-mic'),
      new MockMediaStreamTrack('video', 'remote-cam-video'),
    ])
    pc.ontrack({ track: remoteCam.getVideoTracks()[0], streams: [remoteCam] })

    pm.setRemoteScreenShareActive('remote-peer', true)
    // Safari: el audio de pestaña llega ANTES que el video de pantalla
    const tabAudio = new MockMediaStream([new MockMediaStreamTrack('audio', 'tab-audio')])
    pc.ontrack({ track: tabAudio.getAudioTracks()[0], streams: [tabAudio] })
    // Nada entregado todavía: un main view solo-audio renderiza negro
    expect(screenCb).not.toHaveBeenCalled()

    const screenVideo = new MockMediaStream([new MockMediaStreamTrack('video', 'remote-screen-video')])
    pc.ontrack({ track: screenVideo.getVideoTracks()[0], streams: [screenVideo] })
    expect(screenCb).toHaveBeenCalledTimes(1)
    const comp = screenCb.mock.calls[0][1]
    expect(comp.getVideoTracks()[0].label).toBe('remote-screen-video')
    expect(comp.getAudioTracks()[0].label).toBe('tab-audio')
  })

  it('screen share stopped: composite cleared, tile camera kept, ended track emits null', async () => {
    const camStream = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'cam-audio'),
      new MockMediaStreamTrack('video', 'cam-video'),
    ])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    const remoteCb = vi.fn()
    const screenCb = vi.fn()
    pm.setOnRemoteStream(remoteCb)
    pm.setOnRemoteScreenStream(screenCb)

    await pm.ensureLocalStream()
    await pm.handleOffer('remote-peer', { type: 'offer', sdp: 'v=0\r\n' })
    const pc = pm.getPeers().get('remote-peer')!.connection as any

    const remoteCam = new MockMediaStream([
      new MockMediaStreamTrack('audio', 'remote-mic'),
      new MockMediaStreamTrack('video', 'remote-cam-video'),
    ])
    pc.ontrack({ track: remoteCam.getVideoTracks()[0], streams: [remoteCam] })

    pm.setRemoteScreenShareActive('remote-peer', true)
    const screenStream = new MockMediaStream([new MockMediaStreamTrack('video', 'remote-screen-video')])
    pc.ontrack({ track: screenStream.getVideoTracks()[0], streams: [screenStream] })
    expect(screenCb).toHaveBeenCalledTimes(1)

    // Señal 'screen-share-stopped' → el composite se limpia
    pm.setRemoteScreenShareActive('remote-peer', false)

    // El track de pantalla termina → VideoGrid limpia la vista principal
    const ended = new MockMediaStreamTrack('video', 'remote-screen-video')
    ended.readyState = 'ended'
    pc.ontrack({ track: ended, streams: [new MockMediaStream([ended])] })
    expect(screenCb).toHaveBeenLastCalledWith('remote-peer', null)

    // La cámara del tile permanece
    expect(remoteCb).toHaveBeenCalledTimes(1)
    const sink = pm.getPeers().get('remote-peer')!.stream!
    expect(sink.getVideoTracks()[0].label).toBe('remote-cam-video')
  })
})
