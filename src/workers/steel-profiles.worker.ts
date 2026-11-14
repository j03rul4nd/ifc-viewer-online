// Reads steel profile names from an IFC buffer off the main thread.
// IN  { id, buffer: ArrayBuffer }
// OUT { id, ok: true, entries: Array<[number, string]> } | { id, ok: false, message }

import { geometryFromStep } from '../lib/steel/profiles'

self.onmessage = (e: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
  const { id, buffer } = e.data
  try {
    const text = new TextDecoder('latin1').decode(buffer)
    ;(self as unknown as Worker).postMessage({ id, ok: true, entries: [...geometryFromStep(text)] })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
  }
}
