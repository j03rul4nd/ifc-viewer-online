// ─── Diff store utilities + export helpers ────────────────────────────────────
// Non-destructive edits are stored as diffs in editorStore.
// This module provides helpers to apply diffs and export the modified model.

import type { EditDiff } from '../types'
import { useEditorStore } from '../stores/editorStore'
import { useModelStore } from '../stores/modelStore'

// ── Command helpers ────────────────────────────────────────────────────────────

export function buildRenameCommand(
  expressId: number,
  field: 'Name' | 'LongName' | 'Description',
  oldValue: string,
  newValue: string,
): import('../types').EditorCommand {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    description: `Rename ${field} of #${expressId}: "${oldValue}" → "${newValue}"`,
    diffs: [{ type: 'RENAME', expressId, field, oldValue, newValue }],
  }
}

export function buildFixGuidCommand(
  expressId: number,
  oldGuid: string,
): import('../types').EditorCommand {
  const newGuid = generateIfcGuid()
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    description: `Fix GUID of #${expressId}: regenerated`,
    diffs: [{ type: 'FIX_GUID', expressId, oldGuid, newGuid }],
  }
}

export function buildReparentCommand(
  expressId: number,
  oldParentExpressId: number,
  newParentExpressId: number,
): import('../types').EditorCommand {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    description: `Reparent #${expressId} from #${oldParentExpressId} to #${newParentExpressId}`,
    diffs: [{ type: 'REPARENT', expressId, oldParentExpressId, newParentExpressId }],
  }
}

// ── Export helpers ─────────────────────────────────────────────────────────────

/**
 * Apply diffs to the original IFC buffer using web-ifc IfcAPI.
 * Returns a new Uint8Array with the modified IFC file.
 */
export async function exportAsIfc(): Promise<Uint8Array> {
  const { ifcBuffer } = useModelStore.getState()
  const { diffs }     = useEditorStore.getState()

  if (!ifcBuffer) throw new Error('No IFC buffer loaded')

  // Dynamic import to avoid loading web-ifc on main thread unless needed
  const { IfcAPI } = await import('web-ifc')
  const WEB_IFC_VERSION = '0.0.77'
  const WASM_CDN = `https://unpkg.com/web-ifc@${WEB_IFC_VERSION}/`

  const api = new IfcAPI()
  api.SetWasmPath(WASM_CDN)
  await api.Init()

  const data    = new Uint8Array(ifcBuffer.slice(0))
  const modelId = api.OpenModel(data)

  try {
    for (const diff of diffs) {
      await applyDiff(api, modelId, diff)
    }
    return api.SaveModel(modelId)
  } finally {
    api.CloseModel(modelId)
  }
}

async function applyDiff(
  api: import('web-ifc').IfcAPI,
  modelId: number,
  diff: EditDiff,
): Promise<void> {
  if (diff.type === 'RENAME') {
    // GetLine returns `any` per web-ifc's type signature; the runtime object is
    // a real IfcLineObject and can be written back directly via WriteLine.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const line = api.GetLine(modelId, diff.expressId, false)
    const strVal = { type: 1, value: diff.newValue }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (diff.field === 'Name')             line.Name        = strVal
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    else if (diff.field === 'LongName')    line.LongName    = strVal
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    else if (diff.field === 'Description') line.Description = strVal
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    api.WriteLine(modelId, line)
  } else if (diff.type === 'FIX_GUID') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const line = api.GetLine(modelId, diff.expressId, false)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    line.GlobalId = { type: 1, value: diff.newGuid }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    api.WriteLine(modelId, line)
  }
  // REPARENT: updating IfcRelAggregates/IfcRelContainedInSpatialStructure is complex;
  // reparent diffs are tracked and displayed but not applied at IFC export time yet.
}

/**
 * Export the current Three.js scene as a GLB file.
 * Uses THREE.GLTFExporter on the model's Object3D.
 */
export async function exportAsGlb(): Promise<Blob> {
  const { modelObject } = useModelStore.getState()
  if (!modelObject) throw new Error('No model loaded')

  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()

  const obj = (modelObject as { object: import('three').Object3D }).object
  if (!obj) throw new Error('Model has no Three.js object')

  return new Promise<Blob>((resolve, reject) => {
    exporter.parse(
      obj,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: 'model/gltf-binary' }))
        } else {
          reject(new Error('GLTFExporter returned JSON, expected binary'))
        }
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    )
  })
}

/**
 * Trigger a browser download of a Blob.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── IFC GUID generation ────────────────────────────────────────────────────────
// IFC GlobalId is a 22-character base64-encoded UUID variant.

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function generateIfcGuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let result  = ''
  let i       = 0

  while (i < 16) {
    const b0 = bytes[i++]
    const b1 = bytes[i++] ?? 0
    const b2 = bytes[i++] ?? 0

    result += GUID_CHARS[b0 >> 2]
    result += GUID_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)]
    result += GUID_CHARS[((b1 & 0x0F) << 2) | (b2 >> 6)]
    result += GUID_CHARS[b2 & 0x3F]
  }

  // IFC GUID is exactly 22 characters
  return result.slice(0, 22)
}
