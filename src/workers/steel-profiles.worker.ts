// Reads steel geometry (profile name, length, area) from an IFC buffer off the
// main thread.
// IN  { id, buffer: ArrayBuffer }  (transferred)
// OUT { id, ok: true, entries: Array<[number, GeometryInfo]> } | { id, ok: false, message }

import { geometryFromStep } from '../lib/steel/profiles'

self.onmessage = (e: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
  const { id } = e.data
  try {
    let text: string | null = new TextDecoder('latin1').decode(e.data.buffer)
    const entries = [...geometryFromStep(text)]
    text = null // let the file text go before the reply is sent
    ;(self as unknown as Worker).postMessage({ id, ok: true, entries })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
  }
}
