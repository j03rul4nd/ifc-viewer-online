// ─── From the viewer to the studio ────────────────────────────────────────────
// The studio opens in its own tab before the export starts: browsers only allow
// a new tab during the tap itself, and the open viewer stays usable, ready for
// Split View. If the tab is refused, the same tab goes across once the models
// are saved. Kept apart from the studio so the viewer does not load it.

import { saveContextModels, type ContextModel } from './storage'

export const SKETCH_CHANNEL = 'ifc-sketch'

export type HandoffMessage =
  | { type: 'context-ready' }
  | { type: 'context-failed'; reason: 'too-big' | 'error' }
  /** From the studio: it is listening now, and may have missed the answer. */
  | { type: 'context-ask' }

/** How long the viewer keeps the answer for a tab that is slow to load. */
const ANSWER_FOR_MS = 10 * 60 * 1000

/** Past this the studio would hold more than a phone is likely to keep open. */
export const MAX_CONTEXT_BYTES = 300 * 1024 * 1024

export const contextFits = (sizes: number[]): boolean => sizes.reduce((a, b) => a + b, 0) <= MAX_CONTEXT_BYTES

export interface ModelSource { name: string; read: () => Promise<Blob> }

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
    const models: ContextModel[] = []
    for (const source of sources) models.push({ name: source.name, blob: await source.read() })
    if (!contextFits(models.map((m) => m.blob.size))) {
      if (!tab) throw new Error('The model is too large to sketch over on this device')
      announce({ type: 'context-failed', reason: 'too-big' })
      return
    }
    if (!(await saveContextModels(models))) throw new Error('Could not store the model in this browser')
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
