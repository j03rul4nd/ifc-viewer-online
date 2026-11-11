// ─── From the viewer to the studio ────────────────────────────────────────────
// The studio opens in its own tab before the export starts: browsers only allow
// a new tab during the tap itself, and the open viewer stays usable, ready for
// Split View. If the tab is refused, the same tab goes across once the models
// are saved. One model failing does not cost the others.

import { newId } from './document'
import type { OrbitState } from './types'
import { contextBytes, saveContext, type ContextItem } from './storage'

export const SKETCH_CHANNEL = 'ifc-sketch'

export type HandoffMessage =
  | { type: 'context-ready' }
  | { type: 'context-failed'; reason: 'too-big' | 'error' }
  /** From the studio: it is listening now, and may have missed the answer. */
  | { type: 'context-ask' }
  /** From a references window to the studio that owns the document. */
  | { type: 'images-changed' }
  | { type: 'place'; imageId: string }
  | { type: 'forget'; imageId: string }
  /** From a presenter to the audience window. */
  | { type: 'view'; orbit: OrbitState; pageId: string; laser: { x: number; y: number } | null }
  /** The studio left something for Clip Studio or the cover studio. */
  | { type: 'outbox' }

/** How long the viewer keeps the answer for a tab that is slow to load. */
const ANSWER_FOR_MS = 10 * 60 * 1000

/** Past this the studio would hold more than a phone is likely to keep open. */
export const MAX_CONTEXT_BYTES = 300 * 1024 * 1024

export const contextFits = (sizes: number[]): boolean => sizes.reduce((a, b) => a + b, 0) <= MAX_CONTEXT_BYTES

type ItemBody = { kind: 'mesh'; blob: Blob } | { kind: 'points'; positions: Float32Array; colors?: Uint8Array }

export interface ModelSource { name: string; read: () => Promise<ItemBody | null> }

/** Read every source, skipping the ones that fail. */
export async function readSources(sources: ModelSource[]): Promise<ContextItem[]> {
  const items: ContextItem[] = []
  for (const source of sources) {
    try {
      const body = await source.read()
      if (body) items.push({ id: newId(), name: source.name, ...body })
    } catch { /* a scan or model that will not export must not cost the rest */ }
  }
  return items
}

export async function openSketchWithModels(sources: ModelSource[]): Promise<void> {
  const tab = window.open('/sketch?from-viewer=1', '_blank')
  const channel = new BroadcastChannel(SKETCH_CHANNEL)
  let answer: HandoffMessage | null = null
  channel.onmessage = (e: MessageEvent<HandoffMessage | 'saved'>) => {
    if (answer && e.data !== 'saved' && e.data.type === 'context-ask') channel.postMessage(answer)
  }
  const announce = (message: HandoffMessage) => {
    answer = message
    channel.postMessage(message)
    window.setTimeout(() => channel.close(), ANSWER_FOR_MS)
  }
  try {
    const items = await readSources(sources)
    if (items.length === 0 && sources.length > 0) throw new Error('No open model could be exported')
    if (!contextFits(items.map(contextBytes))) {
      if (!tab) throw new Error('The models are too large to sketch over on this device')
      announce({ type: 'context-failed', reason: 'too-big' })
      return
    }
    if (!(await saveContext(items))) throw new Error('Could not store the models in this browser')
    if (tab) announce({ type: 'context-ready' })
    else {
      channel.close()
      window.location.assign('/sketch?from-viewer=1&ready=1')
    }
  } catch (err) {
    if (!tab) {
      channel.close()
      throw err
    }
    announce({ type: 'context-failed', reason: 'error' })
  }
}
