// ─── IFC Export Web Worker ──────────────────────────────────────────────────────
// Applies non-destructive diffs to the original IFC buffer via web-ifc IfcAPI
// and exports a modified IFC STEP file — all off the main thread.
//
// Message protocol
// ─────────────────
// IN  { type: 'export', id: string, buffer: ArrayBuffer, diffs: EditDiff[], wasmBase: string }
// OUT { type: 'done',  id: string, result: Uint8Array }   ← result is Transferred
//     { type: 'error', id: string, message: string }

import { IfcAPI } from 'web-ifc'
import { applyDiffs, findLossyLines, lineIdsOf } from './export-apply'
import { stampIfcHeader, type IfcHeaderStamp } from '../lib/ifc-header'
import type { EditDiff } from '../types'

// Force single-threaded WASM — nested workers (pthreads) fail inside a worker context
;((): void => {
  const _orig = IfcAPI.prototype.Init
  IfcAPI.prototype.Init = function (locateFile) {
    return _orig.call(this, locateFile, /* forceSingleThread */ true)
  }
})()

// ── Message types ─────────────────────────────────────────────────────────────

type ExportInMsg = {
  type:     'export'
  id:       string
  buffer:   ArrayBuffer
  diffs:    EditDiff[]
  wasmBase: string
  /**
   * What to record in FILE_NAME. Omit to leave the header exactly as it was —
   * which is the old behaviour, and a lie the moment a diff was applied.
   */
  stamp?:   IfcHeaderStamp | null
}

type ExportOutMsg =
  | {
      type: 'done'; id: string; result: Uint8Array; skippedDiffs: number
      /** What the exported file declares — surfaced so the UI never has to guess. */
      schema: string | null
    }
  | { type: 'error'; id: string; message: string }

// ── Diff application ─────────────────────────────────────────────────────────
// applyDiffs lives in export-apply.ts, so a node test can run it against the
// real web-ifc writer: this module installs self.onmessage on import.

// ── Main message handler ──────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<ExportInMsg>): Promise<void> => {
  const { id, buffer, diffs, wasmBase, stamp } = e.data

  try {
    const api = new IfcAPI()
    api.SetWasmPath(wasmBase)
    await api.Init()

    const bytes = new Uint8Array(buffer)
    const modelId = api.OpenModel(bytes)

    // Lines whose text the reader drops ('a\b'): a rewrite would blank it, so
    // their diffs are skipped and counted rather than written.
    const lossy = findLossyLines(api, modelId, bytes, lineIdsOf(diffs))

    const skippedDiffs = applyDiffs(api, modelId, diffs, (diff, err) => {
      console.warn('[export.worker] Skipped diff', diff.type, '#' + diff.expressId, '—', String(err))
    }, lossy)

    const saved = api.SaveModel(modelId)
    const schema = (() => {
      try { return api.GetModelSchema(modelId) || null } catch { return null }
    })()
    api.CloseModel(modelId)

    // Record that this physical file was written here, and when.
    //
    // web-ifc round-trips the header faithfully, which means an edited export
    // still claims the authoring tool produced it, at the original timestamp.
    // For a delivery and conformance tool that is a false provenance record, and
    // it is the one thing a receiving party would use to tell the file apart
    // from what was originally shipped. Stamping is opt-in through the message
    // so the caller stays in control of what goes in.
    const result = stamp ? stampIfcHeader(saved, stamp) : saved

    const out: ExportOutMsg = { type: 'done', id, result, skippedDiffs, schema }
    ;(self as unknown as Worker).postMessage(out, { transfer: [result.buffer] })

  } catch (err) {
    const out: ExportOutMsg = { type: 'error', id, message: String(err) }
    self.postMessage(out)
  }
}
