// ─── IFC parser Web Worker ────────────────────────────────────────────────────
// Uses @thatopen/fragments IfcImporter to convert raw IFC bytes → fragments
// binary entirely off the main thread.  No DOM access required.
//
// Message protocol
// ─────────────────
// IN   { type:'parse', id:string, fileName:string, file?:Blob, buffer?:ArrayBuffer }
//        ↳ file   — the pool path (IfcConvertPool). The File/Blob HANDLE is posted
//                   and read here, so the main thread never materialises the IFC:
//                   the whole-file copy that used to stall it is gone, and its heap
//                   peak during conversion drops from 2× the file to 0×.
//        ↳ buffer — the legacy path (embed-loader, useIfcLoader): the bytes,
//                   *transferred* (zero-copy). When both are sent, buffer wins —
//                   the bytes are already here, reading the file again is waste.
//
// OUT  { type:'stage',    id, stage:'reading'|'converting' }
//        ↳ 'reading' before the File is read (file path only), 'converting'
//          right before IfcImporter.process() — the job can show which one it is
//          in, because neither reports a fraction.
//      { type:'progress', id, phase:'parsing', percent, fraction,
//        process?, state?, className?, entitiesProcessed? }
//        ↳ percent (0..99, rounded) is the legacy field; everything after it is
//          the importer's own ProgressData, passed through untouched so the pool
//          can derive real per-class counts (interpretImporterProgress).
//        ↳ entitiesProcessed is the importer's per-message count; when a message
//          is throttled away its count is carried into the next posted one, so a
//          consumer summing them never loses entities.
//      { type:'result',   id, fragmentsBuffer:ArrayBuffer }
//        ↳ fragmentsBuffer is *transferred* back — without a copy when the
//          importer's output view spans its whole buffer (pako's output does).
//      { type:'error',    id, message, code? }
//        ↳ code: invalid-file | read-failed | out-of-memory | worker-init | parse.
//          The message stays technical English for logs; the UI localises by code.
//
// Conversion is ONE synchronous WASM call (StreamMeshes) per IFC class: while it
// runs this worker cannot even receive a message. There is deliberately no
// 'cancel' message — cancel is worker.terminate(), and the pool respawns.
//
// Pre-flight validation (before any WASM initialisation):
//   • Empty-buffer guard: rejects immediately if the buffer has byteLength 0
//     (corrupt transfer or empty file).
//   • IFC signature check: the first line of every valid IFC/STEP file MUST
//     start with "ISO-10303-21" (IFC2x3/IFC4/IFC4x3) or "STEP;". Files that
//     fail this check are rejected with a clear message before the heavy WASM
//     init, saving time and memory on hosts where WASM loading is slow.
//   • Readable size hint: the error message includes the file size so the user
//     and developers can quickly distinguish "wrong file type" from "truncated
//     upload".
//
// The runtime exports below (classifier, throttle gate, transfer helper) exist
// for unit tests. Main-thread code must import ONLY TYPES from this file: a value
// import would pull web-ifc and fragments into the main bundle.

import * as WEBIFC from 'web-ifc'
import { IfcImporter } from '@thatopen/fragments'
import { validateIfcBuffer } from '../lib/ifc-guards'
import type { LoadErrorCode } from '../lib/loading/types'

// Emscripten's pthread implementation uses self.location.href as the URL for
// spawned sub-workers (the "pthread main script").  Inside a nested ES module
// worker, self.location.href is OUR worker URL, not web-ifc's own script.
// Those sub-workers are created as classic (non-module) workers, so they fail
// with "Cannot use import statement outside a module" the moment they hit our
// first import line.  Passing forceSingleThread=true to IfcAPI.Init causes
// web-ifc to load the ST WASM instead of the MT WASM, which never spawns
// pthread sub-workers at all.
const _origInit = WEBIFC.IfcAPI.prototype.Init
WEBIFC.IfcAPI.prototype.Init = function (
  this: WEBIFC.IfcAPI,
  customLocateFileHandler?: WEBIFC.LocateFileHandlerFn,
): Promise<void> {
  return _origInit.call(this, customLocateFileHandler, /* forceSingleThread */ true)
}

// ── Error classification ──────────────────────────────────────────────────────
// The retry policy needs to know WHY a conversion failed, and the only evidence
// is the thrown text. The patterns are the ones each runtime actually produces:
//   OOM  — Emscripten ("Cannot enlarge memory arrays", "Aborted(OOM)"), V8 on a
//          failed ArrayBuffer ("Array buffer allocation failed"), a WASM trap
//          after a failed grow ("memory access out of bounds"), Firefox/Safari
//          ("out of memory").
//   init — the WASM binary never instantiated: fetch/compile failures that
//          Emscripten reports on its way to abort().
// Everything else is the content's fault as far as anyone can tell: 'parse'.

const OOM_PATTERN =
  /out of memory|Cannot enlarge memory|memory access out of bounds|Array buffer allocation failed|Aborted\(OOM\)/i
const INIT_PATTERN =
  /failed to asynchronously prepare wasm|CompileError|both async and sync fetching of the wasm failed|WebAssembly\.instantiate/i

export type WorkerErrorCode = Extract<
  LoadErrorCode,
  'invalid-file' | 'read-failed' | 'out-of-memory' | 'worker-init' | 'parse'
>

/** `name: message` of a thrown value — the name carries "CompileError"/"RangeError". */
function describeThrown(err: unknown): string {
  if (err instanceof Error) return err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message
  return String(err)
}

/** Classify a conversion failure from its thrown text (OOM is checked first). */
export function classifyConversionError(raw: string): 'out-of-memory' | 'worker-init' | 'parse' {
  if (OOM_PATTERN.test(raw)) return 'out-of-memory'
  if (INIT_PATTERN.test(raw)) return 'worker-init'
  return 'parse'
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

// ── Progress throttle ─────────────────────────────────────────────────────────
// IfcImporter reports once per IFC class, which is already coarse; the gate is
// a guard against a model (or a future importer) that reports far more often,
// because every message costs a structured clone plus a main-thread task.
// Rules: a new process, a start/finish state or a new class always posts;
// otherwise at most one message per interval. A skipped message is never lost:
// its entity count rides on the next posted message of the same process, and a
// pending one is flushed when the process changes or the conversion ends.

export type ImporterProcess = 'geometries' | 'attributes' | 'relations' | 'conversion'
export type ImporterState = 'start' | 'inProgress' | 'finish'

export interface ProgressGate {
  /** Messages to post now, in order (0, 1 or 2 — a flushed pending one first). */
  offer(msg: ProgressMessage): ProgressMessage[]
  /** The skipped message still waiting, if any (call before posting the result). */
  flush(): ProgressMessage[]
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

export function createProgressGate(intervalMs = 50, now: () => number = defaultNow): ProgressGate {
  let last: ProgressMessage | null = null
  let lastAt = 0
  let pending: ProgressMessage | null = null

  const mustPost = (m: ProgressMessage): boolean =>
    last === null
    || m.process !== last.process
    || m.state !== 'inProgress'
    || m.className !== last.className
    || now() - lastAt >= intervalMs

  return {
    offer(msg) {
      const out: ProgressMessage[] = []
      const emit = (m: ProgressMessage): void => { out.push(m); last = m; lastAt = now() }
      // A pending message of another process must land first, or its counts
      // would be added to the wrong process.
      if (pending && pending.process !== msg.process) { emit(pending); pending = null }
      let m = msg
      if (pending) {
        const carried = pending.entitiesProcessed
        if (carried !== undefined) m = { ...msg, entitiesProcessed: (msg.entitiesProcessed ?? 0) + carried }
        pending = null
      }
      if (mustPost(m)) emit(m)
      else pending = m
      return out
    },
    flush() {
      if (!pending) return []
      const m = pending
      pending = null
      last = m
      lastAt = now()
      return [m]
    },
  }
}

// ── Result transfer ───────────────────────────────────────────────────────────

/**
 * The ArrayBuffer to transfer for `bytes`: the view's own buffer when the view
 * spans all of it (no copy — the common case, pako allocates an exact-size
 * output), otherwise a slice of just the view's range. A SharedArrayBuffer
 * cannot be transferred, so it is copied into a plain one.
 */
export function transferableBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = bytes.buffer
  if (typeof SharedArrayBuffer !== 'undefined' && buf instanceof SharedArrayBuffer) {
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return copy.buffer as ArrayBuffer
  }
  if (bytes.byteOffset === 0 && bytes.byteLength === buf.byteLength) return buf as ArrayBuffer
  return (buf as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

// ── Message handler ───────────────────────────────────────────────────────────

function post(msg: WorkerOutMessage, transfer?: Transferable[]): void {
  // In a DedicatedWorkerGlobalScope, postMessage accepts a Transferable[] as second arg.
  // Cast through unknown to bypass the Window.postMessage overload conflict.
  if (transfer) (self.postMessage as (m: unknown, t: Transferable[]) => void)(msg, transfer)
  else self.postMessage(msg)
}

self.onmessage = (e: MessageEvent<WorkerInMessage>): void => {
  const msg = e.data
  // A message without an id has nobody waiting on it — nothing to answer.
  if (!msg || typeof msg !== 'object' || msg.type !== 'parse' || typeof msg.id !== 'string') return
  handleParse(msg).catch((err: unknown) => {
    // handleParse answers every path itself; this is the net under a bug in it,
    // because an unhandled rejection in a worker never reaches worker.onerror
    // and the job would wait forever.
    post({ type: 'error', id: msg.id, code: 'parse', message: `IFC parser worker failed: ${describeThrown(err)}` })
  })
}

async function handleParse(msg: ParseMessage): Promise<void> {
  const { id, fileName } = msg
  let buffer: ArrayBuffer | undefined = msg.buffer

  // ── Read the File here, not on the main thread ────────────────────────────
  if (!buffer && msg.file) {
    post({ type: 'stage', id, stage: 'reading' })
    try {
      buffer = await msg.file.arrayBuffer()
    } catch (err: unknown) {
      const raw = describeThrown(err)
      // A File whose disk entry vanished or lost permission throws
      // NotReadableError; a file larger than the worker can allocate throws a
      // RangeError. Only the second is a memory problem.
      const oom = OOM_PATTERN.test(raw)
      post({
        type: 'error',
        id,
        code: oom ? 'out-of-memory' : 'read-failed',
        message: oom
          ? `Ran out of memory while reading "${fileName}" (${formatSize(msg.file.size)}): ${raw}`
          : `Could not read "${fileName}": ${raw}. The file may have been moved, deleted or its permission revoked.`,
      })
      return
    }
  }

  // ── Pre-flight validation ─────────────────────────────────────────────────
  const check = validateIfcBuffer(buffer, fileName)
  if (!check.ok || !buffer) {
    post({ type: 'error', id, code: 'invalid-file', message: check.reason ?? `No IFC data received for "${fileName}".` })
    return
  }

  const sizeBytes = buffer.byteLength
  try {
    const importer = new IfcImporter()

    // KEEP THE MODEL'S OWN COORDINATES.
    //
    // web-ifc defaults COORDINATE_TO_ORIGIN to false; @thatopen/fragments
    // overrides it to true, which silently translates every model toward the
    // origin. That is a reasonable default for a pure geometry viewer and it is
    // wrong for this app: half of what we do reasons in the model's REAL
    // coordinates — georeferencing, map mode, and above all a surveyed point
    // cloud registered against the IFC. With the datum thrown away, a scan that
    // is correct to two centimetres lands metres from the building it measures.
    // Measured on the CRAS demo: the model was drawn 5.9 m from where its own
    // IFC says it is, so the scan looked badly calibrated when it was not.
    //
    // The cost is real and worth stating: a model with coordinates baked in a
    // projected CRS (UTM eastings run to seven digits) now renders far from the
    // origin, where float32 runs out of resolution and surfaces shimmer. That is
    // already a defect this app REPORTS rather than hides — the validator tells
    // the author to re-export with a base point offset or an IfcMapConversion —
    // so drawing it honestly beats silently moving it and breaking every
    // coordinate-based feature for every other model.
    importer.webIfcSettings = {
      ...importer.webIfcSettings,
      COORDINATE_TO_ORIGIN: false,
    }

    // Use local WASM files; CDN is blocked by COEP require-corp
    importer.wasm = import.meta.env.DEV
      ? { path: `${import.meta.env.BASE_URL}node_modules/web-ifc/`, absolute: true }
      : { path: import.meta.env.BASE_URL, absolute: true }

    const bytes = new Uint8Array(buffer)
    const gate = createProgressGate()

    post({ type: 'stage', id, stage: 'converting' })

    const fragmentsBinary = await importer.process({
      bytes,
      progressCallback: (progress: number, data?: ImporterProgressData) => {
        const fraction = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
        const out: ProgressMessage = {
          type: 'progress',
          id,
          phase: 'parsing',
          percent: Math.min(99, Math.round(fraction * 100)),
          fraction,
        }
        if (data) {
          out.process = data.process
          out.state = data.state
          if (data.class !== undefined) out.className = data.class
          if (data.entitiesProcessed !== undefined) out.entitiesProcessed = data.entitiesProcessed
        }
        for (const m of gate.offer(out)) post(m)
      },
    })
    for (const m of gate.flush()) post(m)

    // Transfer the underlying ArrayBuffer — zero-copy back to main thread.
    const transferBuffer = transferableBuffer(fragmentsBinary)
    post({ type: 'result', id, fragmentsBuffer: transferBuffer }, [transferBuffer])
  } catch (err: unknown) {
    const raw = describeThrown(err)
    const code = classifyConversionError(raw)
    // Surface a human-readable error — WASM errors can be cryptic
    let message: string
    if (code === 'out-of-memory') {
      message = `Ran out of memory while converting "${fileName}" (${formatSize(sizeBytes)}): ${raw}`
    } else if (code === 'worker-init') {
      message = `The IFC engine (web-ifc WebAssembly) failed to start while converting "${fileName}": ${raw}`
    } else if (raw.toLowerCase().includes('wasm')) {
      message = `WebAssembly error while parsing "${fileName}": ${raw}. This may happen if the file is corrupted or uses an unsupported IFC schema.`
    } else {
      message = `Failed to parse "${fileName}": ${raw}`
    }
    post({ type: 'error', id, code, message })
  }

  // Hint to the runtime that this worker is idle; allows GC of large IFC buffer.
  void Promise.resolve().then(() => {
    const gc = (globalThis as Record<string, unknown>)['gc']
    if (typeof gc === 'function') (gc as () => void)()
  })
}

// ── Message types (shared with the pool, embed-loader and loader.ts) ──────────

/** Mirror of fragments' `ProgressData` (kept local so consumers need no fragments import). */
export interface ImporterProgressData {
  process: ImporterProcess
  state: ImporterState
  class?: string
  entitiesProcessed?: number
}

export type WorkerInMessage = ParseMessage

export interface ParseMessage {
  type: 'parse'
  id: string
  fileName: string
  /** Legacy path: the IFC bytes, transferred. */
  buffer?: ArrayBuffer
  /** Pool path: the File/Blob handle, read inside the worker. */
  file?: Blob
}

export type WorkerStage = 'reading' | 'converting'

export interface StageMessage {
  type: 'stage'
  id: string
  stage: WorkerStage
}

export interface ProgressMessage {
  type: 'progress'
  id: string
  phase: 'parsing'
  /** Legacy: importer progress rounded to 0..99. */
  percent: number
  /** Importer overall progress, raw 0..1 (exact — the pool derives counts from it). */
  fraction: number
  process?: ImporterProcess
  state?: ImporterState
  /** IFC class just processed ("IFCWALL"), when the importer names one. */
  className?: string
  /** Entities in this message (plus any carried from throttled ones), NOT cumulative. */
  entitiesProcessed?: number
}

export interface ResultMessage {
  type: 'result'
  id: string
  fragmentsBuffer: ArrayBuffer
}

export interface ErrorMessage {
  type: 'error'
  id: string
  message: string
  code?: WorkerErrorCode
}

export type WorkerOutMessage = ProgressMessage | StageMessage | ResultMessage | ErrorMessage
