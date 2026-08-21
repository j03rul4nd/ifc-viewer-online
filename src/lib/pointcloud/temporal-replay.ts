// ─── temporal-replay ─────────────────────────────────────────────────────────
// Playback clock for recorded/simulated temporal point clouds. It owns time and
// scheduling only; the source owns typed arrays and PointCloudSystem owns GPU
// resources. Keeping those responsibilities separate makes the same clock usable
// for a deterministic fair demo now and an indexed MCAP reader later.

import type { DynamicPointFrame } from './pc-types'

export type TemporalReplayStatus = 'playing' | 'paused' | 'ended'

export interface TemporalReplaySnapshot {
  status: TemporalReplayStatus
  positionMs: number
  durationMs: number
  speed: number
  loop: boolean
  sequence: number
  /** Display frames intentionally skipped when the browser could not keep pace. */
  droppedFrames: number
}

type RequestFrame = (callback: FrameRequestCallback) => number
type CancelFrame = (handle: number) => void

export interface TemporalReplayOptions {
  durationMs: number
  /** Maximum GPU updates per second. The clock itself still follows source time. */
  frameRate: number
  createFrame: (positionMs: number, sequence: number) => DynamicPointFrame
  onFrame: (frame: DynamicPointFrame, state: TemporalReplaySnapshot) => void
  onState?: (state: TemporalReplaySnapshot) => void
  now?: () => number
  requestFrame?: RequestFrame
  cancelFrame?: CancelFrame
}

export class TemporalReplayController {
  private readonly durationMs: number
  private readonly frameIntervalMs: number
  private readonly createFrame: TemporalReplayOptions['createFrame']
  private readonly onFrame: TemporalReplayOptions['onFrame']
  private readonly onState?: TemporalReplayOptions['onState']
  private readonly now: () => number
  private readonly requestFrame: RequestFrame
  private readonly cancelFrame: CancelFrame

  private playing = false
  private disposed = false
  private positionMs = 0
  private speed = 1
  private loop = true
  private sequence = 0
  private droppedFrames = 0
  private lastTickAt = 0
  private lastEmitAt = -Infinity
  private rafId: number | null = null

  constructor(options: TemporalReplayOptions) {
    this.durationMs = Math.max(1, options.durationMs)
    this.frameIntervalMs = 1000 / Math.max(1, options.frameRate)
    this.createFrame = options.createFrame
    this.onFrame = options.onFrame
    this.onState = options.onState
    this.now = options.now ?? (() => performance.now())
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback))
    this.cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle))
  }

  snapshot(): TemporalReplaySnapshot {
    return {
      status: this.playing ? 'playing' : this.positionMs >= this.durationMs ? 'ended' : 'paused',
      positionMs: this.positionMs,
      durationMs: this.durationMs,
      speed: this.speed,
      loop: this.loop,
      sequence: this.sequence,
      droppedFrames: this.droppedFrames,
    }
  }

  play(): void {
    if (this.disposed || this.playing) return
    if (this.positionMs >= this.durationMs) this.positionMs = 0
    this.playing = true
    this.lastTickAt = this.now()
    this.lastEmitAt = -Infinity
    this.emitFrame(this.lastTickAt)
    this.schedule()
  }

  pause(): void {
    if (this.disposed) return
    this.playing = false
    this.cancelScheduled()
    this.publishState()
  }

  seek(positionMs: number): void {
    if (this.disposed) return
    this.positionMs = Math.min(this.durationMs, Math.max(0, positionMs))
    this.lastTickAt = this.now()
    this.lastEmitAt = -Infinity
    this.emitFrame(this.lastTickAt)
    this.publishState()
  }

  /** Finite recordings define "latest" as their final timestamp. */
  jumpToLatest(): void {
    if (this.disposed) return
    this.playing = false
    this.cancelScheduled()
    this.positionMs = this.durationMs
    const now = this.now()
    this.lastTickAt = now
    this.lastEmitAt = -Infinity
    this.emitFrame(now)
    this.publishState()
  }

  setSpeed(speed: number): void {
    if (this.disposed) return
    this.speed = Math.min(4, Math.max(0.25, speed))
    this.lastTickAt = this.now()
    this.publishState()
  }

  setLoop(loop: boolean): void {
    if (this.disposed) return
    this.loop = loop
    this.publishState()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.playing = false
    this.cancelScheduled()
  }

  private schedule(): void {
    if (!this.playing || this.disposed || this.rafId !== null) return
    this.rafId = this.requestFrame((at) => {
      this.rafId = null
      this.tick(at)
    })
  }

  private cancelScheduled(): void {
    if (this.rafId === null) return
    this.cancelFrame(this.rafId)
    this.rafId = null
  }

  private tick(at: number): void {
    if (!this.playing || this.disposed) return
    const elapsed = Math.max(0, at - this.lastTickAt)
    this.lastTickAt = at
    let next = this.positionMs + elapsed * this.speed

    if (next >= this.durationMs) {
      if (this.loop) {
        next %= this.durationMs
      } else {
        next = this.durationMs
        this.playing = false
      }
    }
    this.positionMs = next

    if (at - this.lastEmitAt >= this.frameIntervalMs || !this.playing) {
      if (Number.isFinite(this.lastEmitAt)) {
        const missed = Math.floor((at - this.lastEmitAt) / this.frameIntervalMs) - 1
        this.droppedFrames += Math.max(0, missed)
      }
      this.emitFrame(at)
    }
    this.publishState()
    this.schedule()
  }

  private emitFrame(at: number): void {
    this.sequence += 1
    this.lastEmitAt = at
    const frame = this.createFrame(this.positionMs, this.sequence)
    this.onFrame(frame, this.snapshot())
  }

  private publishState(): void {
    this.onState?.(this.snapshot())
  }
}
