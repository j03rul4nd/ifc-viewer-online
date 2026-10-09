// ─── history-frames ───────────────────────────────────────────────────────────
// Recorded twin history, read on demand by the inspector's sparklines. Kept out
// of device-runner so the inspector can load it lazily without pulling the
// polling machinery (and the layer fetchers) into its chunk.
//
// Cached per source for 15 s: a sparkline is a glance, and IndexedDB + gunzip
// on every new reading would be the expensive part.

import { indexedDbBackend } from '../layers/history-store'
import type { Frame } from '../layers/history-codec'

const framesBySource = new Map<string, { at: number; frames: Promise<Frame[]> }>()

export function loadTwinFrames(sourceId: string, maxAgeMs = 15_000): Promise<Frame[]> {
  const hit = framesBySource.get(sourceId)
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.frames
  const frames = indexedDbBackend().load(`twin:${sourceId}`).catch(() => [] as Frame[])
  framesBySource.set(sourceId, { at: Date.now(), frames })
  return frames
}
