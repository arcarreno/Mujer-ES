import { vi } from 'vitest'

// =====================================================
// Mock MediaStreamTrack
// =====================================================
class MockMediaStreamTrack {
  kind: string
  label: string
  enabled: boolean = true
  readyState: string = 'live'
  id: string
  onended: (() => void) | null = null
  onunmute: (() => void) | null = null

  constructor(kind: string, label?: string) {
    this.kind = kind
    this.label = label || `mock-${kind}-track`
    this.id = Math.random().toString(36).slice(2)
  }

  stop() {
    this.readyState = 'ended'
  }

  clone() {
    return new MockMediaStreamTrack(this.kind, this.label)
  }
}

// =====================================================
// Mock MediaStream
// =====================================================
class MockMediaStream {
  id: string
  private tracks: MockMediaStreamTrack[]

  constructor(tracks?: MockMediaStreamTrack[]) {
    this.tracks = tracks || []
    this.id = Math.random().toString(36).slice(2)
  }

  getTracks() {
    return this.tracks as any[]
  }

  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio') as any[]
  }

  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video') as any[]
  }

  addTrack(track: any) {
    this.tracks.push(track)
  }
}

// =====================================================
// Mock RTCSessionDescription
// =====================================================
class MockRTCSessionDescription {
  type: string
  sdp: string
  constructor(init?: { type?: string; sdp?: string }) {
    this.type = init?.type || ''
    this.sdp = init?.sdp || 'v=0\r\n'
  }
  toJSON() {
    return { type: this.type, sdp: this.sdp }
  }
}

// =====================================================
// Mock RTCIceCandidate
// =====================================================
class MockRTCIceCandidate {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
  constructor(init?: any) {
    this.candidate = init?.candidate || 'candidate:1 1 udp 2122260223 192.168.1.1 50000 typ host'
    this.sdpMid = init?.sdpMid || '0'
    this.sdpMLineIndex = init?.sdpMLineIndex ?? 0
  }
  toJSON() {
    return {
      candidate: this.candidate,
      sdpMid: this.sdpMid,
      sdpMLineIndex: this.sdpMLineIndex,
    }
  }
}

// =====================================================
// Mock RTCRtpSender
// =====================================================
class MockRTCRtpSender {
  track: any = null
  private _kind: string
  constructor(track?: any) {
    this.track = track || null
    this._kind = track?.kind || ''
  }
  async replaceTrack(newTrack: any) {
    this.track = newTrack
  }
}

// =====================================================
// Mock RTCPeerConnection
// =====================================================
class MockRTCPeerConnection {
  localDescription: any = null
  remoteDescription: any = null
  signalingState: string = 'stable'
  connectionState: string = 'new'
  iceConnectionState: string = 'new'

  onicecandidate: ((event: { candidate: any }) => void) | null = null
  ontrack: ((event: { track: any; streams: any[] }) => void) | null = null
  onnegotiationneeded: (() => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  onconnectionstatechange: (() => void) | null = null

  private _senders: MockRTCRtpSender[] = []
  private _closed = false

  addTrack(track: any, stream: any) {
    const sender = new MockRTCRtpSender(track)
    this._senders.push(sender)
    return sender as any
  }

  getSenders() {
    return this._senders as any[]
  }

  async setLocalDescription(desc?: any) {
    if (desc) {
      this.localDescription = new MockRTCSessionDescription(desc)
    } else {
      this.localDescription = new MockRTCSessionDescription({
        type: 'offer',
        sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
      })
    }
  }

  async setRemoteDescription(desc: any) {
    this.remoteDescription = new MockRTCSessionDescription(desc)
    if (desc.type === 'answer') {
      this.signalingState = 'stable'
    } else if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer'
    }
  }

  async addIceCandidate(candidate: any) {
    // no-op in mock
  }

  async createOffer(_options?: any) {
    return new MockRTCSessionDescription({
      type: 'offer',
      sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
    })
  }

  async createAnswer() {
    return new MockRTCSessionDescription({
      type: 'answer',
      sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
    })
  }

  async getStats() {
    return new Map()
  }

  close() {
    this._closed = true
    this.connectionState = 'closed'
  }

  get closed() {
    return this._closed
  }
}

// =====================================================
// Override globals
// =====================================================
;(globalThis as any).MediaStream = MockMediaStream
;(globalThis as any).MediaStreamTrack = MockMediaStreamTrack
;(globalThis as any).RTCPeerConnection = MockRTCPeerConnection
;(globalThis as any).RTCSessionDescription = MockRTCSessionDescription
;(globalThis as any).RTCIceCandidate = MockRTCIceCandidate

// =====================================================
// Mock navigator.mediaDevices
// =====================================================
let getUserMediaMock: ReturnType<typeof vi.fn>
let getDisplayMediaMock: ReturnType<typeof vi.fn>

function setupMediaDevices() {
  getUserMediaMock = vi.fn()
  getDisplayMediaMock = vi.fn()

  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: getUserMediaMock,
      getDisplayMedia: getDisplayMediaMock,
    },
    writable: true,
    configurable: true,
  })
}

setupMediaDevices()

// =====================================================
// Mock Supabase
// =====================================================
const mockChannelInstance = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  track: vi.fn().mockResolvedValue('ok'),
  send: vi.fn().mockResolvedValue('ok'),
  untrack: vi.fn().mockResolvedValue('ok'),
  presenceState: vi.fn().mockReturnValue({}),
}

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannelInstance),
  removeChannel: vi.fn().mockResolvedValue('ok'),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null,
    }),
  },
}

vi.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}))

// =====================================================
// Mock dependent modules
// =====================================================
vi.mock('../lib/active-speaker', () => {
  return {
    ActiveSpeakerDetector: class {
      setCallback = vi.fn()
      setLocalStream = vi.fn()
      addPeer = vi.fn()
      removePeer = vi.fn()
      start = vi.fn()
      stop = vi.fn()
    },
  }
})

vi.mock('../lib/silence-suppression', () => {
  return {
    SilenceSuppressor: class {
      start = vi.fn()
      stop = vi.fn()
    },
  }
})

vi.mock('../lib/connection-quality', () => {
  return {
    ConnectionQualityMonitor: class {
      setCallback = vi.fn()
      addPeer = vi.fn()
      removePeer = vi.fn()
      start = vi.fn()
      stop = vi.fn()
    },
  }
})

vi.mock('../lib/reconnection', () => {
  return {
    ReconnectionManager: class {
      setCallback = vi.fn()
      start = vi.fn()
      stop = vi.fn()
    },
  }
})

// Export for test access
export { getUserMediaMock, getDisplayMediaMock, mockSupabase, mockChannelInstance, MockMediaStreamTrack, MockMediaStream }
