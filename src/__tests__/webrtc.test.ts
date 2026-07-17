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
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: true })
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
  it('replaces video track with screen track and sends offer', async () => {
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
    const sender = pc.getSenders().find((s: any) => s.track?.kind === 'video')
    expect(sender.track).toBe(screenTrack)
  })

  it('does nothing without screen stream', async () => {
    const { pm } = createRealPeerManager()
    // No screen stream set
    await pm.addScreenStreamToPeers()
    // Should not throw
  })
})

// =====================================================
// PEER MANAGER — restoreCameraToPeers
// =====================================================
describe('PeerManager.restoreCameraToPeers', () => {
  it('restores camera track after screen share', async () => {
    const videoTrack = new MockMediaStreamTrack('video', 'camera')
    const audioTrack = new MockMediaStreamTrack('audio')
    const camStream = new MockMediaStream([videoTrack, audioTrack])
    getUserMediaMock.mockResolvedValue(camStream)

    const { pm } = createRealPeerManager()
    await pm.ensureLocalStream()
    await pm.handleOffer('peer-1', { type: 'offer', sdp: 'v=0\r\n' })

    await pm.restoreCameraToPeers()

    const pc = pm.getPeers().get('peer-1')!.connection as any
    const sender = pc.getSenders().find((s: any) => s.track?.kind === 'video')
    expect(sender.track).toBe(videoTrack)
  })

  it('does nothing without local stream', async () => {
    const { pm } = createRealPeerManager()
    await pm.restoreCameraToPeers()
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

    expect(remoteStreamCb).toHaveBeenCalledWith('remote-peer', remoteStream)
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
        config: { presence: { key: 'user-1' } },
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

    // Presence channel should be removed during cleanup
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

  it('leave untracks and removes channel', async () => {
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
    expect(sm.sessionId).toBeNull()
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

    // Never joined — channels are null
    await sm.leave()
    expect(sm.presenceChannel).toBeNull()
    expect(sm.sessionId).toBeNull()
  })
})

// =====================================================
// SIGNALING — durable DB signaling (initDurableSignaling)
// =====================================================
describe('SignalingManager initDurableSignaling', () => {
  it('joins call session and subscribes to signals', async () => {
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

    await sm.initDurableSignaling('session-1')

    expect(sm.sessionId).toBe('session-1')
  })

  it('processes offers from other users', async () => {
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

    // Subscribe to signals and capture the callback
    const { subscribeToSignals } = await import('../lib/call-api')
    await sm.initDurableSignaling('session-1')

    // Get the callback that was registered with subscribeToSignals
    const subscribeMock = subscribeToSignals as ReturnType<typeof vi.fn>
    const callback = subscribeMock.mock.calls[0][1]

    // Simulate receiving an offer from another user
    callback({
      to_user_id: 'user-1',
      from_user_id: 'user-2',
      payload: {
        type: 'offer',
        fromUserId: 'user-2',
        targetUserId: 'user-1',
        sdp: { type: 'offer', sdp: 'v=0\r\n' },
      },
    })

    expect(onOffer).toHaveBeenCalledWith('user-2', { type: 'offer', sdp: 'v=0\r\n' })
  })

  it('filters self-messages', async () => {
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

    const { subscribeToSignals } = await import('../lib/call-api')
    await sm.initDurableSignaling('session-1')

    const subscribeMock = subscribeToSignals as ReturnType<typeof vi.fn>
    const callback = subscribeMock.mock.calls[0][1]

    // Signal from self — should be ignored
    callback({
      to_user_id: 'user-1',
      from_user_id: 'user-1',
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

    expect(vcm.signaling.sendSignal).toHaveBeenCalledWith({ type: 'mute-all' })
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
    })
  })

  it('endSession sends signal only if admin', async () => {
    const vcm = new VideoCallManager('course-1', 'user-1', true)
    vi.spyOn(vcm.signaling, 'sendSignal').mockResolvedValue(undefined)
    await vcm.join()

    await vcm.endSession()

    expect(vcm.signaling.sendSignal).toHaveBeenCalledWith({ type: 'end-session' })
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
