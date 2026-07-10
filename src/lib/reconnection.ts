// =====================================================
// RECONNECTION MANAGER
// =====================================================
// Handles automatic reconnection with exponential backoff
// Similar to Discord's zero-downtime failover

export interface ReconnectionConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  jitterMs: number
}

export type ReconnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export type ReconnectionCallback = (state: ReconnectionState, attempt: number, nextRetryMs: number) => void

const DEFAULT_CONFIG: ReconnectionConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 500,
}

export class ReconnectionManager {
  private config: ReconnectionConfig
  private state: ReconnectionState = 'idle'
  private attempt = 0
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private callback: ReconnectionCallback | null = null
  private connectFn: (() => Promise<void>) | null = null
  private lastConnectedAt = 0
  private connectionId = 0

  constructor(config?: Partial<ReconnectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  setCallback(callback: ReconnectionCallback): void {
    this.callback = callback
  }

  setConnectFunction(fn: () => Promise<void>): void {
    this.connectFn = fn
  }

  getState(): ReconnectionState {
    return this.state
  }

  getAttempt(): number {
    return this.attempt
  }

  // Start connection (initial or reconnection)
  async connect(): Promise<void> {
    if (!this.connectFn) {
      throw new Error('No connect function set')
    }

    this.connectionId++
    const currentConnectionId = this.connectionId

    this.setState('connecting', 0, 0)

    try {
      await this.connectFn()
      this.lastConnectedAt = Date.now()
      this.attempt = 0
      this.setState('connected', 0, 0)
    } catch (e) {
      console.error('[Reconnection] Connection failed:', e)
      this.scheduleReconnect(currentConnectionId)
    }
  }

  // Called when connection is lost
  onConnectionLost(): void {
    if (this.state === 'connected') {
      this.scheduleReconnect(this.connectionId)
    }
  }

  // Called when connection is restored
  onConnectionRestored(): void {
    this.attempt = 0
    this.lastConnectedAt = Date.now()
    this.setState('connected', 0, 0)
  }

  // Stop all reconnection attempts
  stop(): void {
    this.connectionId++
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.state = 'idle'
    this.attempt = 0
  }

  private scheduleReconnect(connectionId: number): void {
    if (this.attempt >= this.config.maxAttempts) {
      this.setState('failed', this.attempt, 0)
      return
    }

    this.attempt++

    // Calculate delay with exponential backoff + jitter
    const baseDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, this.attempt - 1),
      this.config.maxDelayMs
    )
    const jitter = Math.random() * this.config.jitterMs
    const delay = baseDelay + jitter

    this.setState('reconnecting', this.attempt, delay)

    this.timeoutId = setTimeout(async () => {
      // Check if we're still supposed to reconnect
      if (connectionId !== this.connectionId) return

      if (!this.connectFn) return

      try {
        await this.connectFn()
        this.lastConnectedAt = Date.now()
        this.attempt = 0
        this.setState('connected', 0, 0)
      } catch (e) {
        console.warn(`[Reconnection] Attempt ${this.attempt} failed:`, e)
        this.scheduleReconnect(connectionId)
      }
    }, delay)
  }

  private setState(state: ReconnectionState, attempt: number, nextRetryMs: number): void {
    this.state = state
    this.callback?.(state, attempt, nextRetryMs)
  }

  // Get time since last successful connection
  getTimeSinceLastConnection(): number {
    return Date.now() - this.lastConnectedAt
  }
}
