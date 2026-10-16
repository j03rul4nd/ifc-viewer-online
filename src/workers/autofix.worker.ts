// Runs the IFC auto-fix off the main thread: decoding and rewriting a large
// STEP file would otherwise freeze the viewer.
// IN  { id, buffer: ArrayBuffer }
// OUT { id, ok: true, bytes: Uint8Array, report } | { id, ok: false, message }

import { autoFixIfc } from '../lib/autofix/fixes'

self.onmessage = (e: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
  const { id, buffer } = e.data
  try {
    // IFC files are ASCII with \X2\ escapes; latin1 keeps every byte as-is.
    const text = new TextDecoder('latin1').decode(buffer)
    const { text: fixed, report } = autoFixIfc(text)
    const bytes = new Uint8Array(fixed.length)
    for (let i = 0; i < fixed.length; i++) bytes[i] = fixed.charCodeAt(i) & 0xff
    ;(self as unknown as Worker).postMessage({ id, ok: true, bytes, report }, { transfer: [bytes.buffer] })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
  }
}
