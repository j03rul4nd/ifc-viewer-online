// Runs the As-Built Score pipeline off the main thread. DARK: not wired to UI yet.
// IN  { id, input: AsBuiltPipelineInput }  — post with
//     asBuiltTransferables(input) (lib/asbuilt/pipeline) as the transfer list.
// OUT { id, ok: true, result: AsBuiltPipelineResult } | { id, ok: false, message }

import { runAsBuilt, type AsBuiltPipelineInput } from '../lib/asbuilt/pipeline'

self.onmessage = (e: MessageEvent<{ id: string; input: AsBuiltPipelineInput }>) => {
  const { id } = e.data
  try {
    const result = runAsBuilt(e.data.input)
    ;(self as unknown as Worker).postMessage({ id, ok: true, result })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
  }
}

