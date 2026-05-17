// ─── Memory statistics ────────────────────────────────────────────────────────
// Uses performance.measureUserAgentSpecificMemory() when available
// (requires crossOriginIsolated), falls back to legacy performance.memory.
// GPU estimate is derived from an injected callback (provided by the viewer).

import type { MemoryStats } from '../types'
import { createLogger } from './logger'

const log = createLogger('Memory')

// Legacy Chrome memory API (non-standard, but widely available in Chromium)
interface LegacyMemory {
  usedJSHeapSize: number
}

type MeasureMemoryFn = () => Promise<{ bytes: number }>

/**
 * One-shot heap + GPU memory snapshot.
 * @param getGpuEstimateBytes  Optional function returning the caller's
 *   current GPU memory estimate in bytes (e.g. from THREE renderer info).
 */
export async function getMemoryStats(
  getGpuEstimateBytes?: () => number,
): Promise<MemoryStats> {
  let heapBytes = 0

  const measureFn = (performance as unknown as { measureUserAgentSpecificMemory?: MeasureMemoryFn })
    .measureUserAgentSpecificMemory

  if (crossOriginIsolated && typeof measureFn === 'function') {
    try {
      const result = await measureFn.call(performance)
      heapBytes = result.bytes
    } catch (err) {
      log.debug('measureUserAgentSpecificMemory failed, falling back:', err)
      heapBytes = legacyHeap()
    }
  } else {
    heapBytes = legacyHeap()
  }

  const gpuEstimateBytes = getGpuEstimateBytes?.() ?? 0

  return {
    heapMB:        Math.round(heapBytes        / (1024 * 1024)),
    gpuEstimateMB: Math.round(gpuEstimateBytes / (1024 * 1024)),
  }
}

function legacyHeap(): number {
  const mem = (performance as unknown as { memory?: LegacyMemory }).memory
  return mem?.usedJSHeapSize ?? 0
}

/**
 * Polls memory every `intervalMs` milliseconds.
 * Returns a stop function. Automatically handles errors per tick.
 */
export function startMemoryTracking(
  callback:           (stats: MemoryStats) => void,
  getGpuEstimateBytes?: () => number,
  intervalMs         = 3_000,
): () => void {
  let stopped = false

  const tick = async (): Promise<void> => {
    if (stopped) return
    try {
      const stats = await getMemoryStats(getGpuEstimateBytes)
      if (!stopped) callback(stats)
    } catch (err) {
      log.warn('Memory tick failed:', err)
    }
    if (!stopped) setTimeout(() => { void tick() }, intervalMs)
  }

  void tick()
  return () => { stopped = true }
}
