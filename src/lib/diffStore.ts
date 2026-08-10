// ─── Diff store utilities + export helpers ────────────────────────────────────
// Non-destructive edits are stored as diffs in editorStore.
// Each EditorCommand carries an optional modelId so exports are scoped
// to the correct model's buffer (avoiding expressId collisions across models).

import type { EditDiff, EditorCommand } from '../types'
import { APP_VERSION } from './app-version'
import type { IFCItemData } from './viewer'
import type { SelectedInfo } from '../types'
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
/** What the export writes into the file's FILE_NAME header. */
export interface IfcExportOptions {
  /**
   * Record that this physical file was written here, and when. On by default.
   *
   * web-ifc round-trips the header faithfully, so without this an edited export
   * still claims the authoring tool produced it at the original timestamp. That
   * is a false provenance record, and provenance is the product here — turning
   * it off should be a deliberate act.
   */
  stampHeader?: boolean
  /** Overrides FILE_NAME author. Omitted leaves whatever the file carried. */
  author?: string[]
  organization?: string[]
  /** FILE_NAME authorization, for deliverables that require one. */
  authorization?: string
}

export interface IfcExportResult {
  bytes: Uint8Array
  /** What the exported file declares — 'IFC4', 'IFC2X3', 'IFC4X3_ADD2'… */
  schema: string | null
  /** Diffs web-ifc refused. Already surfaced as a toast; returned for callers. */
  skippedDiffs: number
}

let lastExportSchema: string | null = null

/** Schema the most recent IFC export declared. Null before the first one. */
export function getLastExportSchema(): string | null {
  return lastExportSchema
}

export async function exportAsIfc(
  buffer: ArrayBuffer,
  diffs: EditDiff[],
  options: IfcExportOptions = {},
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
      const msg = e.data as {
        type: string; id: string; result?: Uint8Array; message?: string
        skippedDiffs?: number; schema?: string | null
      }
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
        log.info(
          'IFC export complete, size:', msg.result.byteLength,
          'schema:', msg.schema ?? 'unknown',
        )
        lastExportSchema = msg.schema ?? null
        resolve(msg.result)
      } else {
        reject(new Error(msg.message ?? 'Export worker failed'))
      }
    }
    worker.onerror = (e: ErrorEvent): void => {
      worker.terminate()
      reject(new Error(e.message || 'Export worker script error — WASM may have failed to initialise'))
    }
    // Default ON. An export that silently keeps the authoring tool's stamp is
    // the thing being fixed, so opting OUT is what takes an argument.
    const stamp = options.stampHeader === false ? null : {
      // preprocessor_version means "the toolkit that wrote this physical file",
      // which after an export is genuinely us. originating_system is left alone:
      // the model still came from wherever it was authored, and overwriting that
      // would be a different falsehood from the one being corrected.
      preprocessorVersion: `IFC Viewer Online ${APP_VERSION}`,
      ...(options.author ? { author: options.author } : {}),
      ...(options.organization ? { organization: options.organization } : {}),
      ...(options.authorization !== undefined ? { authorization: options.authorization } : {}),
    }

    worker.postMessage(
      { type: 'export', id, buffer: bufferCopy, diffs, wasmBase, stamp },
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
 *
 * For .ifc and .glb files, prefers the File System Access API
 * (showSaveFilePicker) so the user gets a native "Save As…" dialog with a
 * suggested filename and a file-type filter — same UX as a native app.
 * Falls back to the classic <a download> approach when the API is unavailable
 * (Safari for IFC, Firefox, or any non-secure context).
 *
 * If the user dismisses the picker dialog, the cancellation is respected
 * and no fallback download is triggered.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const ext          = fileName.split('.').pop()?.toLowerCase() ?? ''
  const canUsePicker = (ext === 'ifc' || ext === 'glb') && 'showSaveFilePicker' in window

  if (canUsePicker) {
    try {
      // Minimal inline types — FilePickerAcceptType / showSaveFilePicker are not
      // yet part of TypeScript's lib.dom.d.ts, so we declare what we need locally.
      type FsaAccept   = { description: string; accept: Record<string, string[]> }
      type FsaWritable = { write(data: Blob): Promise<void>; close(): Promise<void> }
      type FsaHandle   = { createWritable(): Promise<FsaWritable> }
      type FsaPicker   = (opts: { suggestedName: string; types: FsaAccept[] }) => Promise<FsaHandle>
      const pick = (window as unknown as { showSaveFilePicker: FsaPicker }).showSaveFilePicker
      const types: FsaAccept[] = ext === 'ifc'
        ? [{ description: 'IFC File',     accept: { 'application/x-step': ['.ifc'] } }]
        : [{ description: 'GLB 3D Model', accept: { 'model/gltf-binary':  ['.glb'] } }]
      const handle   = await pick({ suggestedName: fileName, types })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (err) {
      // User dismissed the dialog — respect the cancellation, no fallback
      if (err instanceof DOMException && err.name === 'AbortError') return
      // SecurityError / NotAllowedError / etc → fall through to classic download
    }
  }

  // Classic <a download> — Safari, Firefox, non-IFC/GLB formats
  const url = URL.createObjectURL(blob)
  const a   = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

// ── Element property export (JSON / CSV) ──────────────────────────────────────

function escCsv(v: unknown): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

/**
 * Serialize all properties of the selected element to JSON.
 * Pending edits (diffs) are merged over the original IFC values.
 */
export function exportElementToJson(
  selected: SelectedInfo,
  data: IFCItemData,
  pendingRenames: Map<string, string> = new Map(),
  pendingPropEdits: Map<string, string> = new Map(),
): string {
  const attrs: Record<string, unknown> = {
    expressId: selected.id,
    ifcType:   selected.type,
    name:      pendingRenames.get('Name')      ?? data.name,
    longName:  pendingRenames.get('LongName')  ?? data.longName,
    description: pendingRenames.get('Description') ?? data.description,
    globalId:  data.globalId,
    objectType: data.objectType,
    tag:       data.tag,
    storey:    data.storey,
  }

  const psets = data.propertySets.map(ps => ({
    name: ps.name,
    properties: ps.properties.map(p => ({
      name:  p.name,
      value: pendingPropEdits.has(String(p.expressId))
        ? pendingPropEdits.get(String(p.expressId))
        : p.value,
      type: p.type,
    })),
  }))

  const quantitySets = data.quantitySets.map(qs => ({
    name: qs.name,
    quantities: qs.quantities.map(q => ({ name: q.name, value: q.value, type: q.quantityType })),
  }))

  const typeProperties = data.typeProperties.map(ps => ({
    name: ps.name,
    properties: ps.properties.map(p => ({ name: p.name, value: p.value, type: p.type })),
  }))

  const materials = data.materials.map(m => ({
    name: m.name,
    ...(m.layerThickness !== undefined ? { layerThickness: m.layerThickness } : {}),
  }))

  return JSON.stringify(
    { attributes: attrs, propertySets: psets, quantitySets, typeProperties, materials },
    null,
    2,
  )
}

/**
 * Serialize all properties of the selected element to CSV.
 * Columns: Section, Set Name, Property Name, Value, Type
 */
export function exportElementToCsv(
  selected: SelectedInfo,
  data: IFCItemData,
  pendingRenames: Map<string, string> = new Map(),
  pendingPropEdits: Map<string, string> = new Map(),
): string {
  const rows: string[] = ['Section,Set Name,Property Name,Value,Type']

  const attr = (key: string, label: string, value: unknown): void => {
    rows.push([escCsv('Attributes'), escCsv('IFC Attributes'), escCsv(label), escCsv(value), ''].join(','))
  }

  attr('expressId',   'Express ID',   selected.id)
  attr('ifcType',     'IFC Type',     selected.type)
  attr('name',        'Name',         pendingRenames.get('Name')      ?? data.name)
  attr('longName',    'Long Name',    pendingRenames.get('LongName')  ?? data.longName)
  attr('description', 'Description',  pendingRenames.get('Description') ?? data.description)
  attr('globalId',    'Global ID',    data.globalId)
  attr('objectType',  'Object Type',  data.objectType)
  attr('tag',         'Tag',          data.tag)
  attr('storey',      'Storey',       data.storey)

  for (const ps of data.propertySets) {
    for (const p of ps.properties) {
      const v = pendingPropEdits.has(String(p.expressId)) ? pendingPropEdits.get(String(p.expressId)) : p.value
      rows.push([escCsv('Property Sets'), escCsv(ps.name), escCsv(p.name), escCsv(v), escCsv(p.type ?? '')].join(','))
    }
  }

  for (const qs of data.quantitySets) {
    for (const q of qs.quantities) {
      rows.push([escCsv('Quantities'), escCsv(qs.name), escCsv(q.name), escCsv(q.value), escCsv(q.quantityType)].join(','))
    }
  }

  for (const ps of data.typeProperties) {
    for (const p of ps.properties) {
      rows.push([escCsv('Type Properties'), escCsv(ps.name), escCsv(p.name), escCsv(p.value), escCsv(p.type ?? '')].join(','))
    }
  }

  for (const m of data.materials) {
    rows.push([escCsv('Materials'), escCsv('Materials'), escCsv(m.name),
      escCsv(m.layerThickness !== undefined ? m.layerThickness : ''), escCsv('Material')].join(','))
  }

  return rows.join('\n')
}

// ── IFC GUID generation ────────────────────────────────────────────────────────

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/**
 * Generate a spec-compliant IFC GlobalId (IfcGloballyUniqueId).
 *
 * An IFC GUID is a 128-bit UUID encoded in 22 characters of a base64 *variant*
 * (charset `0-9A-Za-z_$`). It is NOT plain base64: 22 chars hold 132 bits, so to
 * round-trip back to 128 bits the **first character encodes only 2 bits** — its
 * value must be 0–3. The remaining 21 chars encode the 15 trailing bytes as five
 * groups of 3 bytes → 4 chars each (2 + 20 = 22).
 *
 * The previous implementation byte-aligned standard base64 from byte 0 and sliced
 * to 22 chars, which let the first char take any of the 64 symbols. Such GUIDs
 * pass this app's lax 22-char regex but decode to an out-of-range (>128-bit) value
 * in strict toolkits (ifcOpenShell, Solibri) — i.e. the auto-fix could emit GUIDs
 * those tools consider malformed. This encoder matches ifcOpenShell's `compress`.
 */
export function generateIfcGuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))

  // First byte → 2 chars; the leading char holds only the top 2 bits (0–3).
  let result = GUID_CHARS[b[0] >> 6] + GUID_CHARS[b[0] & 0x3F]

  // Remaining 15 bytes → 5 groups of 3 bytes → 4 chars each.
  for (let i = 1; i < 16; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]
    result +=
      GUID_CHARS[(n >> 18) & 0x3F] +
      GUID_CHARS[(n >> 12) & 0x3F] +
      GUID_CHARS[(n >> 6)  & 0x3F] +
      GUID_CHARS[ n        & 0x3F]
  }

  return result
}
