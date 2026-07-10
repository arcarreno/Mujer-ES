// =====================================================
// CONNECTION QUALITY MONITORING
// =====================================================
// Monitors WebRTC connection quality and provides adaptive bitrate suggestions
// Similar to Discord's quality adaptation

export interface ConnectionQuality {
  userId: string
  score: number // 0-100 (100 = excellent)
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  stats: {
    rtt: number // Round-trip time in ms
    jitter: number // Jitter in ms
    packetLoss: number // Packet loss percentage (0-1)
    bitrate: number // Current bitrate in bps
    framesPerSecond: number
    resolution: string
  }
  timestamp: number
}

export type QualityCallback = (qualities: ConnectionQuality[]) => void

const QUALITY_CHECK_INTERVAL_MS = 2000 // Check every 2 seconds
const STATS_WINDOW_SIZE = 5 // Number of samples to average

export class ConnectionQualityMonitor {
  private peers: Map<string, RTCPeerConnection> = new Map()
  private callback: QualityCallback | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private statsHistory: Map<string, { bytesReceived: number; timestamp: number }[]> = new Map()
  private isRunning = false

  setCallback(callback: QualityCallback): void {
    this.callback = callback
  }

  addPeer(userId: string, pc: RTCPeerConnection): void {
    this.peers.set(userId, pc)
    this.statsHistory.set(userId, [])
  }

  removePeer(userId: string): void {
    this.peers.delete(userId)
    this.statsHistory.delete(userId)
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true

    this.intervalId = setInterval(() => {
      this.checkQuality()
    }, QUALITY_CHECK_INTERVAL_MS)
  }

  stop(): void {
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async checkQuality(): Promise<void> {
    const qualities: ConnectionQuality[] = []

    for (const [userId, pc] of this.peers) {
      try {
        const quality = await this.analyzePeer(userId, pc)
        if (quality) {
          qualities.push(quality)
        }
      } catch (e) {
        // Connection might be closing
      }
    }

    if (this.callback && qualities.length > 0) {
      this.callback(qualities)
    }
  }

  private async analyzePeer(userId: string, pc: RTCPeerConnection): Promise<ConnectionQuality | null> {
    const stats = await pc.getStats()
    let inboundRtp: any = null
    let candidatePair: any = null

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        inboundRtp = report
      }
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        candidatePair = report
      }
    })

    if (!inboundRtp) return null

    // Calculate bitrate from bytesReceived delta
    const history = this.statsHistory.get(userId) || []
    const now = Date.now()
    const currentBytes = inboundRtp.bytesReceived || 0

    history.push({ bytesReceived: currentBytes, timestamp: now })
    if (history.length > STATS_WINDOW_SIZE) {
      history.shift()
    }
    this.statsHistory.set(userId, history)

    let bitrate = 0
    if (history.length >= 2) {
      const first = history[0]
      const last = history[history.length - 1]
      const bytesDelta = last.bytesReceived - first.bytesReceived
      const timeDelta = (last.timestamp - first.timestamp) / 1000
      bitrate = timeDelta > 0 ? (bytesDelta * 8) / timeDelta : 0
    }

    // Extract stats
    const rtt = candidatePair?.currentRoundTripTime ? candidatePair.currentRoundTripTime * 1000 : 0
    const jitter = inboundRtp.jitter ? inboundRtp.jitter * 1000 : 0
    const packetsLost = inboundRtp.packetsLost || 0
    const packetsReceived = inboundRtp.packetsReceived || 1
    const packetLoss = packetsLost / (packetsLost + packetsReceived)
    const framesPerSecond = inboundRtp.framesPerSecond || 0
    const resolution = inboundRtp.frameWidth && inboundRtp.frameHeight
      ? `${inboundRtp.frameWidth}x${inboundRtp.frameHeight}`
      : 'unknown'

    // Calculate quality score (0-100)
    let score = 100

    // RTT penalty (0-30 points)
    if (rtt > 300) score -= 30
    else if (rtt > 150) score -= 20
    else if (rtt > 80) score -= 10
    else if (rtt > 40) score -= 5

    // Jitter penalty (0-20 points)
    if (jitter > 50) score -= 20
    else if (jitter > 25) score -= 15
    else if (jitter > 10) score -= 10
    else if (jitter > 5) score -= 5

    // Packet loss penalty (0-30 points)
    if (packetLoss > 0.1) score -= 30
    else if (packetLoss > 0.05) score -= 20
    else if (packetLoss > 0.02) score -= 10
    else if (packetLoss > 0.01) score -= 5

    // Bitrate penalty (0-20 points)
    if (bitrate < 100000) score -= 20 // < 100 kbps
    else if (bitrate < 300000) score -= 10 // < 300 kbps
    else if (bitrate < 500000) score -= 5 // < 500 kbps

    score = Math.max(0, Math.min(100, score))

    // Determine level
    let level: ConnectionQuality['level']
    if (score >= 80) level = 'excellent'
    else if (score >= 60) level = 'good'
    else if (score >= 40) level = 'fair'
    else if (score >= 20) level = 'poor'
    else level = 'critical'

    return {
      userId,
      score,
      level,
      stats: {
        rtt,
        jitter,
        packetLoss,
        bitrate,
        framesPerSecond,
        resolution,
      },
      timestamp: now,
    }
  }

  // Get suggested max bitrate based on connection quality
  getSuggestedBitrate(userId: string): number {
    const history = this.statsHistory.get(userId)
    if (!history || history.length === 0) return 2500000 // Default 2.5 Mbps

    // Simple heuristic based on recent bitrate
    const last = history[history.length - 1]
    const bytesDelta = history.length >= 2
      ? last.bytesReceived - history[history.length - 2].bytesReceived
      : 0
    const currentBitrate = bytesDelta * 8 * (1000 / QUALITY_CHECK_INTERVAL_MS)

    // Suggest 80% of current bitrate if it's stable
    return Math.max(100000, Math.min(2500000, currentBitrate * 0.8))
  }
}
