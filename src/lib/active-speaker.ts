// =====================================================
// ACTIVE SPEAKER DETECTION (Client-side via WebRTC getStats)
// =====================================================
// Similar to Discord's VAD (Voice Activity Detection)
// Detects who's speaking based on audio levels from RTCStatsReport

export interface SpeakerLevel {
  userId: string
  level: number // 0-1 normalized
  isSpeaking: boolean
  timestamp: number
}

export type ActiveSpeakerCallback = (speakers: SpeakerLevel[]) => void

// Audio level thresholds
const SPEAKING_THRESHOLD = 0.01 // Minimum audio level to consider speaking
const SILENCE_TIMEOUT_MS = 1500 // How long after last speech to consider silent
const STATS_INTERVAL_MS = 200 // How often to poll getStats()

export class ActiveSpeakerDetector {
  private peers: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private callback: ActiveSpeakerCallback | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastSpeakingTime: Map<string, number> = new Map()
  private currentLevels: Map<string, SpeakerLevel> = new Map()
  private isRunning = false
  private audioCtx: AudioContext | null = null
  private audioSource: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null

  setCallback(callback: ActiveSpeakerCallback): void {
    this.callback = callback
  }

  addPeer(userId: string, pc: RTCPeerConnection): void {
    this.peers.set(userId, pc)
  }

  removePeer(userId: string): void {
    this.peers.delete(userId)
    this.currentLevels.delete(userId)
    this.lastSpeakingTime.delete(userId)
  }

  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream
    // Rebuild the cached audio-analysis graph every time the stream changes
    // instead of creating a new AudioContext every ~200ms while polling.
    this.teardownAudioNodes()
    // Only build the audio-analysis graph when there is actually an audio
    // track — avoids consuming an AudioContext slot (iOS ~6-context limit)
    // for camera-only / muted streams.
    if (!stream || !stream.getAudioTracks().length) return
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      this.audioCtx = ctx
      this.audioSource = source
      this.analyser = analyser
    } catch {
      this.audioCtx = null
      this.audioSource = null
      this.analyser = null
    }
  }

  private teardownAudioNodes(): void {
    try {
      this.audioSource?.disconnect()
    } catch {
      // ignore
    }
    this.audioSource = null
    this.analyser = null
    try {
      this.audioCtx?.close()
    } catch {
      // ignore
    }
    this.audioCtx = null
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true

    this.intervalId = setInterval(() => {
      this.detectSpeaking()
    }, STATS_INTERVAL_MS)
  }

  stop(): void {
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.teardownAudioNodes()
  }

  private async detectSpeaking(): Promise<void> {
    const now = Date.now()
    const speakers: SpeakerLevel[] = []

    // Check local audio level
    if (this.localStream) {
      const localLevel = await this.getLocalAudioLevel()
      const isSpeaking = localLevel > SPEAKING_THRESHOLD

      if (isSpeaking) {
        this.lastSpeakingTime.set('local', now)
      }

      const timeSinceLastSpeech = now - (this.lastSpeakingTime.get('local') || 0)
      const stillSpeaking = isSpeaking || timeSinceLastSpeech < SILENCE_TIMEOUT_MS

      const level: SpeakerLevel = {
        userId: 'local',
        level: localLevel,
        isSpeaking: stillSpeaking,
        timestamp: now,
      }
      this.currentLevels.set('local', level)
      speakers.push(level)
    }

    // Check remote audio levels
    for (const [userId, pc] of this.peers) {
      try {
        const stats = await pc.getStats()
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            // Use audioLevel if available (Chrome), otherwise estimate from bytesReceived
            let level = 0

            if (report.audioLevel !== undefined) {
              level = report.audioLevel
            } else if (report.bytesReceived !== undefined) {
              // Estimate from bytes received delta
              const prev = this.currentLevels.get(userId)
              if (prev) {
                const bytesDelta = report.bytesReceived - (prev as any)._bytesReceived || 0
                level = Math.min(bytesDelta / 1000, 1) // Rough estimate
              }
              ;(prev as any)._bytesReceived = report.bytesReceived
            }

            const isSpeaking = level > SPEAKING_THRESHOLD

            if (isSpeaking) {
              this.lastSpeakingTime.set(userId, now)
            }

            const timeSinceLastSpeech = now - (this.lastSpeakingTime.get(userId) || 0)
            const stillSpeaking = isSpeaking || timeSinceLastSpeech < SILENCE_TIMEOUT_MS

            const speakerLevel: SpeakerLevel = {
              userId,
              level,
              isSpeaking: stillSpeaking,
              timestamp: now,
            }
            this.currentLevels.set(userId, speakerLevel)
            speakers.push(speakerLevel)
          }
        })
      } catch (e) {
        // getStats() can fail if connection is closing
      }
    }

    // Notify callback
    if (this.callback && speakers.length > 0) {
      this.callback(speakers)
    }
  }

  private getLocalAudioLevel(): number {
    if (!this.localStream) return 0

    const audioTrack = this.localStream.getAudioTracks()[0]
    if (!audioTrack || !audioTrack.enabled) return 0

    const ctx = this.audioCtx
    const analyser = this.analyser
    if (!ctx || !analyser) return 0

    try {
      // AudioContexts may start suspended (iOS, non-user-gesture). Resume it so
      // the analyser produces real data. On iOS resume() can reject when not
      // tied to a gesture — swallow that; the level just stays 0.
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(dataArray)

      // Calculate RMS level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255

      return rms
    } catch {
      return 0
    }
  }

  // Get the current active speaker (highest level)
  getActiveSpeaker(): string | null {
    let maxLevel = 0
    let activeSpeaker: string | null = null

    for (const [userId, level] of this.currentLevels) {
      if (level.isSpeaking && level.level > maxLevel) {
        maxLevel = level.level
        activeSpeaker = userId
      }
    }

    return activeSpeaker
  }

  // Get all current speaker levels
  getLevels(): SpeakerLevel[] {
    return Array.from(this.currentLevels.values())
  }

  // Check if a specific user is speaking
  isSpeaking(userId: string): boolean {
    return this.currentLevels.get(userId)?.isSpeaking || false
  }
}
