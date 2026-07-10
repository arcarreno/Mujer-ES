// =====================================================
// SILENCE SUPPRESSION (AudioWorklet)
// =====================================================
// Similar to Discord's silence suppression
// Detects silence and mutes the audio track to save bandwidth
// When silence is detected, no audio packets are sent

const SILENCE_THRESHOLD = 0.01 // RMS level below this = silence
const SILENCE_DELAY_MS = 300 // Wait this long after last speech before muting

export class SilenceSuppressor {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private audioTrack: MediaStreamTrack | null = null
  private isSuppressing = false
  private onStateChange: ((suppressing: boolean) => void) | null = null

  setOnStateChange(callback: (suppressing: boolean) => void): void {
    this.onStateChange = callback
  }

  async start(stream: MediaStream): Promise<MediaStream> {
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return stream

    try {
      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 48000 })

      // Load the worklet processor
      await this.audioContext.audioWorklet.addModule(
        'data:application/javascript,' +
        encodeURIComponent(`
          class SilenceDetectorProcessor extends AudioWorkletProcessor {
            constructor() {
              super()
              this.isSilent = true
              this.lastSpeechTime = 0
            }

            process(inputs, outputs, parameters) {
              const input = inputs[0]
              if (!input || input.length === 0) return true

              const channelData = input[0]
              if (!channelData) return true

              // Calculate RMS level
              let sum = 0
              for (let i = 0; i < channelData.length; i++) {
                sum += channelData[i] * channelData[i]
              }
              const rms = Math.sqrt(sum / channelData.length)

              const now = currentTime * 1000
              const threshold = ${SILENCE_THRESHOLD}

              if (rms > threshold) {
                this.lastSpeechTime = now
                if (this.isSilent) {
                  this.isSilent = false
                  this.port.postMessage({ type: 'speaking' })
                }
              } else if (now - this.lastSpeechTime > ${SILENCE_DELAY_MS}) {
                if (!this.isSilent) {
                  this.isSilent = true
                  this.port.postMessage({ type: 'silent' })
                }
              }

              return true
            }
          }

          registerProcessor('silence-detector', SilenceDetectorProcessor)
        `)
      )

      // Create source from original stream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream)

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'silence-detector')

      // Listen for silence/speaking events
      this.workletNode.port.onmessage = (event) => {
        const { type } = event.data
        if (type === 'silent' && !this.isSuppressing) {
          this.isSuppressing = true
          this.audioTrack?.dispatchEvent(new Event('mute'))
          this.onStateChange?.(true)
        } else if (type === 'speaking' && this.isSuppressing) {
          this.isSuppressing = false
          this.audioTrack?.dispatchEvent(new Event('unmute'))
          this.onStateChange?.(false)
        }
      }

      // Connect: source → worklet → destination (passthrough)
      this.sourceNode.connect(this.workletNode)
      this.workletNode.connect(this.audioContext.destination)

      // Store reference to the audio track for mute/unmute
      this.audioTrack = audioTrack

      // Return the original stream (worklet monitors but doesn't modify)
      return stream
    } catch (e) {
      console.warn('[SilenceSuppression] Failed to initialize:', e)
      return stream
    }
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.isSuppressing = false
    this.audioTrack = null
  }

  getIsSuppressing(): boolean {
    return this.isSuppressing
  }
}
