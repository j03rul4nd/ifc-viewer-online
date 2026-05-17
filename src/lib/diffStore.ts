// ─── Diff store utilities + export helpers ────────────────────────────────────
// Non-destructive edits are stored as diffs in editorStore.
// Each EditorCommand carries an optional modelId so exports are scoped
// to the correct model's buffer (avoiding expressId collisions across models).

import type { EditDiff, EditorCommand } from '../types'
import { useEditorStore } from '../stores/editorStore'
import { createLogger }  from './logger'
import { toast }         from '../stores/toastStore'

const log = createLogger('DiffStore')

// ── Command builders ───────────────────────────────────────────────────────────

export function buildRenameCommand(
  expressId: number,
  field: 'Name' | 'LongName' | 'Description',
  oldValue: string,
  newValue: string,
  modelId?: string,
): EditorCommand {
  return {
    id:          crypto.randomUUID(),
    timestamp:   Date.now(),
    description: `Rename ${field} of #${expressId}: "${oldValue}" → "${newValue}"`,
    diffs:       [{ type: 'RENAME', expressId, field, oldValue, newValue }],
    modelId,
  }
}

export function buildFixGuidCommand(
  expressId: number,
  oldGuid: string,
  modelId?: string,
): EditorCommand {
  const newGuid = generateIfcGuid()
  return {
    id:          crypto.randomUUID(),
    timestamp:   Date.now(),
    description: `Fix GUID of #${expressId}: regenerated`,
    diffs:       [{ type: 'FIX_GUID', expressId, oldGuid, newGuid }],
    modelId,
  }
}

export function buildReparentCommand(
  expressId: number,
  oldParentExpressId: number,
  newParentExpressId: number,
  modelId?: string,
): EditorCommand {
  return {
    id:          crypto.randomUUID(),
    timestamp:   Date.now(),
    description: `Reparent #${expressId} from #${oldParentExpressId} to #${newParentExpressId}`,
    diffs:       [{ type: 'REPARENT', expressId, oldParentExpressId, newParentExpressId }],
    modelId,
  }
}

export function buildSetPropertyCommand(
  expressId: number,
  psetName: string,
  propName: string,
  propExpressId: number,
  oldValue: string,
  newValue: string,
  modelId?: string,
): EditorCommand {
  return {
    id:          crypto.randomUUID(),
    timestamp:   Date.now(),
    description: `Set property "${propName}" in "${psetName}" on #${expressId}: "${oldValue}" → "${newValue}"`,
    diffs:       [{ type: 'SET_PROPERTY', expressId, psetName, propName, propExpressId, oldValue, newValue }],
    modelId,
  }
}

// ── Diff filtering ─────────────────────────────────────────────────────────────

/**
 * Return all active diffs that apply to a specific model.
 * Commands without a modelId are included for every model (legacy / single-model usage).
 */
export function getDiffsForModel(modelId: string): EditDiff[] {
  const { history, historyIndex } = useEditorStore.getState()
  return history
    .slice(0, historyIndex + 1)
    .filter((cmd) => !cmd.modelId || cmd.modelId === modelId)
    .flatMap((cmd) => cmd.diffs)
}

/** Total number of active diffs across all models. */
export function getTotalDiffCount(): number {
  const { diffs } = useEditorStore.getState()
  return diffs.length
}

/** Number of active diffs for a specific model. */
export function getDiffCountForModel(modelId: string): number {
  return getDiffsForModel(modelId).length
}

// ── Export helpers ─────────────────────────────────────────────────────────────

/**
 * Apply diffs to an IFC buffer via a dedicated export worker.
 * Returns a new Uint8Array with the modified IFC file.
 * Runs WASM off the main thread — UI stays responsive during export.
 */
export async function exportAsIfc(
  buffer: ArrayBuffer,
  diffs: EditDiff[],
): Promise<Uint8Array> {
  if (!buffer || buffer.byteLength === 0) throw new Error('No IFC buffer provided')

  log.info('Exporting IFC via worker — applying', diffs.length, 'diffs')

  const wasmBase = import.meta.env.DEV
    ? `${import.meta.env.BASE_URL}node_modules/web-ifc/`
    : import.meta.env.BASE_URL

  const worker = new Worker(
    new URL('../workers/export.worker.ts', import.meta.url),
    { type: 'module' },
  )

  const id         = crypto.randomUUID()
  const bufferCopy = buffer.slice(0)

  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent): void => {
      const msg = e.data as { type: string; id: string; result?: Uint8Array; message?: string; skippedDiffs?: number }
      if (msg.id !== id) return
      worker.terminate()
      if (msg.type === 'done' && msg.result) {
        if ((msg.skippedDiffs ?? 0) > 0) {
          const s = msg.skippedDiffs!
          log.warn(`IFC export: ${s} diff${s > 1 ? 's' : ''} could not be applied and were skipped`)
          toast(
            `Exported with ${s} skipped edit${s > 1 ? 's' : ''} — some changes could not be applied to the IFC.`,
            'warning',
          )
        }
        log.info('IFC export complete, size:', msg.result.byteLength)
        resolve(msg.result)
      } else {
        reject(new Error(msg.message ?? 'Export worker failed'))
      }
    }
    worker.onerror = (e: ErrorEvent): void => {
      worker.terminate()
      reject(new Error(e.message || 'Export worker script error — WASM may have failed to initialise'))
    }
    worker.postMessage(
      { type: 'export', id, buffer: bufferCopy, diffs, wasmBase },
      [bufferCopy],
    )
  })
}

/**
 * Export a Three.js object as a binary GLB file.
 * The caller retrieves the object via viewerApi.getModelObject(modelId).
 */
export async function exportAsGlb(obj: import('three').Object3D): Promise<Blob> {
  log.info('Exporting GLB')

  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()

  return new Promise<Blob>((resolve, reject) => {
    exporter.parse(
      obj,
      (result) => {
        if (result instanceof ArrayBuffer) {
          log.info('GLB export complete, size:', result.byteLength)
          resolve(new Blob([result], { type: 'model/gltf-binary' }))
        } else {
          reject(new Error('GLTFExporter returned JSON, expected binary'))
        }
      },
      (e) => {
        const err = e instanceof Error ? e : new Error(String(e))
        log.error('GLB export failed:', err.message)
        reject(err)
      },
      { binary: true },
    )
  })
}

/**
 * Trigger a browser file download for a Blob.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a   = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

// ── IFC GUID generation ────────────────────────────────────────────────────────

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function generateIfcGuid(): string {
  const bytes  = crypto.getRandomValues(new Uint8Array(16))
  let result   = ''
  let i        = 0

  while (i < 16) {
    const b0 = bytes[i++]
    const b1 = bytes[i++] ?? 0
    const b2 = bytes[i++] ?? 0
    result += GUID_CHARS[b0 >> 2]
    result += GUID_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)]
    result += GUID_CHARS[((b1 & 0x0F) << 2) | (b2 >> 6)]
    result += GUID_CHARS[b2 & 0x3F]
  }

  return result.slice(0, 22)
}
