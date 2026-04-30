// ─── IFC parser Web Worker ────────────────────────────────────────────────────
// Uses @thatopen/fragments IfcImporter to convert raw IFC bytes → fragments
// binary entirely off the main thread.  No DOM access required.
//
// Message protocol
// ─────────────────
// IN   { type:'parse',  id:string, buffer:ArrayBuffer, fileName:string }
//        ↳ buffer is *transferred* (zero-copy) from the main thread
//
// OUT  { type:'progress', id:string, phase:'parsing', percent:number }
//      { type:'result',   id:string, fragmentsBuffer:ArrayBuffer }
//        ↳ fragmentsBuffer is *transferred* back to the main thread
//      { type:'error',    id:string, message:string }

import * as WEBIFC from 'web-ifc'
import { IfcImporter } from '@thatopen/fragments'

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

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerInMessage>): void => {
  const msg = e.data
  if (msg.type === 'parse') {
    void handleParse(msg)
  }
}

async function handleParse(msg: ParseMessage): Promise<void> {
  const { id, buffer, fileName } = msg

  try {
    const importer = new IfcImporter()

    // Use local WASM files; CDN is blocked by COEP require-corp
    importer.wasm = import.meta.env.DEV
      ? { path: `${import.meta.env.BASE_URL}node_modules/web-ifc/`, absolute: true }
      : { path: import.meta.env.BASE_URL, absolute: true }

    const bytes = new Uint8Array(buffer)

    const fragmentsBinary = await importer.process({
      bytes,
      progressCallback: (progress: number) => {
        self.postMessage({
          type: 'progress',
          id,
          phase: 'parsing',
          percent: Math.min(99, Math.round(progress * 100)),
        } satisfies ProgressMessage)
      },
    })

    // Transfer the underlying ArrayBuffer — zero-copy back to main thread.
    const transferBuffer = fragmentsBinary.buffer.slice(
      fragmentsBinary.byteOffset,
      fragmentsBinary.byteOffset + fragmentsBinary.byteLength,
    ) as ArrayBuffer

    // In a DedicatedWorkerGlobalScope, postMessage accepts a Transferable[] as second arg.
    // Cast through unknown to bypass the Window.postMessage overload conflict.
    ;(self.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'result', id, fragmentsBuffer: transferBuffer } satisfies ResultMessage,
      [transferBuffer],
    )
  } catch (err: unknown) {
    self.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err),
    } satisfies ErrorMessage)
  }

  // Hint to the runtime that this worker is idle; allows GC of large IFC buffer.
  void Promise.resolve().then(() => {
    const gc = (globalThis as Record<string, unknown>)['gc']
    if (typeof gc === 'function') (gc as () => void)()
  })
}

// ── Message types (shared with loader.ts via a loose protocol) ─────────────

type WorkerInMessage = ParseMessage

interface ParseMessage {
  type: 'parse'
  id: string
  buffer: ArrayBuffer
  fileName: string
}

interface ProgressMessage {
  type: 'progress'
  id: string
  phase: 'parsing'
  percent: number
}

interface ResultMessage {
  type: 'result'
  id: string
  fragmentsBuffer: ArrayBuffer
}

interface ErrorMessage {
  type: 'error'
  id: string
  message: string
}

export type WorkerOutMessage = ProgressMessage | ResultMessage | ErrorMessage
