// ─── simulated-live-transport ────────────────────────────────────────────────
// A deterministic fault injector for exhibition/testing. It passes the demo
// through the exact binary decoder and bounded jitter buffer intended for a
// future sensor gateway, while remaining explicitly labelled simulated.

import type { DynamicPointFrame } from './pc-types'
import { BoundedLiveFrameBuffer, type LiveFrameBufferStats } from './live-frame-buffer'
import { encodeLivePointFrameInto, encodedLivePointFrameByteLength } from './live-point-frame'

export type SimulatedTransportMode = 'stable' | 'unstable'
export type SimulatedTransportStatus = 'connected' | 'degraded' | 'reconnecting'

export interface SimulatedTransportSnapshot {
  mode: SimulatedTransportMode
  status: SimulatedTransportStatus
  simulatedLatencyMs: number
  reconnects: number
  linkDropped: number
  buffer: LiveFrameBufferStats
}

export class SimulatedLiveTransport {
  private readonly ring: BoundedLiveFrameBuffer
  private readonly packet: Uint8Array
  private readonly heldPacket: Uint8Array
  private heldLength = 0
  private mode: SimulatedTransportMode = 'stable'
  private status: SimulatedTransportStatus = 'connected'
  private simulatedLatencyMs = 18
  private reconnects = 0
  private linkDropped = 0
  private wasDisconnected = false

  constructor(frameCapacity: number) {
    this.ring = new BoundedLiveFrameBuffer(3, frameCapacity)
    const packetCapacity = encodedLivePointFrameByteLength(frameCapacity)
    this.packet = new Uint8Array(packetCapacity)
    this.heldPacket = new Uint8Array(packetCapacity)
  }

  setMode(mode: SimulatedTransportMode): void {
    this.mode = mode
    this.status = 'connected'
    this.wasDisconnected = false
    this.heldLength = 0
    this.ring.clear()
  }

  snapshot(): SimulatedTransportSnapshot {
    return {
      mode: this.mode,
      status: this.status,
      simulatedLatencyMs: this.simulatedLatencyMs,
      reconnects: this.reconnects,
      linkDropped: this.linkDropped,
      buffer: this.ring.snapshot(),
    }
  }

  transmit(frame: DynamicPointFrame, consumer: (decoded: DynamicPointFrame) => void): boolean {
    if (this.mode === 'stable') {
      this.status = 'connected'
      this.simulatedLatencyMs = 18 + (frame.sequence % 5) * 2
      const length = encodeLivePointFrameInto(frame, this.packet)
      this.ring.push(this.packet.subarray(0, length))
      return this.ring.consumeLatest(consumer)
    }

    // A short deterministic outage approximately once per eight seconds at
    // 12 fps. This is a fault-injection profile, not invented sensor telemetry.
    const cycle = frame.sequence % 96
    const disconnected = cycle >= 62 && cycle <= 69
    if (disconnected) {
      this.status = 'reconnecting'
      this.simulatedLatencyMs = 0
      this.linkDropped++
      if (!this.wasDisconnected) {
        this.wasDisconnected = true
        if (this.heldLength > 0) { this.linkDropped++; this.heldLength = 0 }
      }
      return false
    }
    if (this.wasDisconnected) {
      this.wasDisconnected = false
      this.reconnects++
    }

    this.status = 'degraded'
    this.simulatedLatencyMs = 34 + (frame.sequence * 17) % 83

    // Loss happens before validation, as it would on an unreliable gateway.
    if (frame.sequence % 13 === 0) {
      this.linkDropped++
      return false
    }

    // Hold one frame, then deliver the following packet before it. The ring
    // observes the reorder and displays only the freshest valid sequence.
    if (this.heldLength === 0 && frame.sequence % 17 === 0) {
      this.heldLength = encodeLivePointFrameInto(frame, this.heldPacket)
      return false
    }

    const length = encodeLivePointFrameInto(frame, this.packet)
    if (frame.sequence % 41 === 0 && length > 100) this.packet[100] ^= 0x40
    this.ring.push(this.packet.subarray(0, length))
    if (this.heldLength > 0) {
      this.ring.push(this.heldPacket.subarray(0, this.heldLength))
      this.heldLength = 0
    }
    return this.ring.consumeLatest(consumer)
  }
}
