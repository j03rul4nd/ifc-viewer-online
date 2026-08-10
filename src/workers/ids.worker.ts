// ─── ids.worker.ts ────────────────────────────────────────────────────────────
// Runs an IDS check off the main thread: opens the IFC with web-ifc, gathers the
// applicable elements (class + attributes + property/quantity sets) and runs the
// pure IDS engine. Re-parses the IFC in its own model — fine for an on-demand check.
//
// Protocol v2 (P1-2): Zod-validated messages, throttled progress posts and
// cooperative cancellation. The gather/check loops run in chunks and yield to the
// event loop between chunks so a posted `cancel` message can actually be handled
// (a worker cannot receive messages while synchronous code is running). The
// runner additionally hard-terminates after a 2 s grace — cancel never hangs.
//
// Every inbound `check-ids` gets exactly one `result` or one `error` back. There
// is no third outcome and no silent drop: the main thread's only other signal is
// a 120 s watchdog, and an unhandled rejection in a worker does not fire
// worker.onerror, so anything this file swallows becomes two minutes of spinner
// followed by the wrong error code.
//
// Results carry the count of entities the gather could not read, so a score
// computed over part of the model can say so.

import { IfcAPI } from 'web-ifc'
import { checkSpec, summarizeResults } from '../lib/ids/ids-engine'
import { gatherIdsElements } from '../lib/ids/ids-gather'
import type { IdsErrorCode, IdsPhase, IdsSpecResult } from '../lib/ids/ids-types'
import { parseIdsInMsg, type IdsCheckMsg, type IdsOutMsg } from '../lib/worker-schemas'

// Force single-threaded WASM (nested pthreads fail inside a worker).
;((): void => {
  const _orig = IfcAPI.prototype.Init
  IfcAPI.prototype.Init = function (locateFile) { return _orig.call(this, locateFile, true) }
})()

const CHECK_YIELD_MS = 40
const PROGRESS_MIN_INTERVAL_MS = 100 // ≤ 10 posts/s

const post = (m: IdsOutMsg): void => { (self as unknown as Worker).postMessage(m) }

/** Yield one macrotask so pending `cancel` messages get delivered. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

class CancelledError extends Error { constructor() { super('Check cancelled') } }

const cancelledRuns = new Set<string>()
let checkStarted = false

function throwIfCancelled(runId: string): void {
  if (cancelledRuns.has(runId)) throw new CancelledError()
}

type ProgressFn = (phase: IdsPhase, pct: number) => void

function makeProgressPoster(runId: string): ProgressFn {
  let lastAt = 0
  let lastPhase: IdsPhase | null = null
  return (phase, pct) => {
    const now = Date.now()
    if (phase === lastPhase && now - lastAt < PROGRESS_MIN_INTERVAL_MS) return
    lastPhase = phase
    lastAt = now
    post({ type: 'progress', id: runId, phase, pct: Math.max(0, Math.min(100, Math.round(pct))) })
  }
}

function classifyError(err: unknown): IdsErrorCode {
  const msg = err instanceof Error ? err.message : String(err)
  return /memory|alloc|abort\(/i.test(msg) ? 'oom' : 'unknown'
}

async function runCheck(msg: IdsCheckMsg): Promise<void> {
  const { id, doc } = msg
  const progress = makeProgressPoster(id)
  let api: IfcAPI | null = null
  let modelId = -1
  try {
    api = new IfcAPI()
    api.SetWasmPath(import.meta.env.DEV ? `${import.meta.env.BASE_URL}node_modules/web-ifc/` : import.meta.env.BASE_URL)
    progress('open', 0)
    try {
      await api.Init()
    } catch (err) {
      post({ type: 'error', id, code: 'worker-init', message: `web-ifc init failed: ${err instanceof Error ? err.message : String(err)}` })
      return
    }
    progress('open', 10)
    throwIfCancelled(id)
    try {
      modelId = api.OpenModel(new Uint8Array(msg.buffer))
    } catch (err) {
      post({ type: 'error', id, code: 'model-open', message: err instanceof Error ? err.message : String(err) })
      return
    }
    progress('open', 20)
    throwIfCancelled(id)

    // Model schema, reported on the result (IdsResult.modelSchema) and passed to
    // the engine. It does NOT drive the ifcVersion gate: that gate is opt-in via
    // IdsCheckOptions.filterByIfcVersion and nothing in the app turns it on, so
    // a spec targeting another schema is evaluated rather than skipped. Losing
    // the schema therefore costs the result's label, not the check.
    let modelSchema: string | undefined
    try {
      const s = api.GetModelSchema(modelId)
      if (typeof s === 'string' && s) modelSchema = s
    } catch { /* header unreadable → the result carries no schema */ }

    // Entities the gather had to skip. Every skip is deliberate (one bad line
    // must not abort a check over the other 400 000) but a skipped element never
    // becomes applicable, so it leaves the score silently — hence the count.
    let unreadable = 0
    const elements = await gatherIdsElements(api, modelId, doc, {
      onProgress: (pct) => progress('gather', pct),
      yieldNow: tick,
      throwIfCancelled: () => throwIfCancelled(id),
      onUnreadable: () => { unreadable++ },
    })
    progress('check', 75)

    // Check phase: per-spec, yielding on a time budget so cancel stays responsive
    // even with many specs (one pathological spec is covered by the runner's
    // 2 s hard-terminate).
    const specs: IdsSpecResult[] = []
    const totalSpecs = doc.specifications.length
    let lastYield = Date.now()
    for (let i = 0; i < totalSpecs; i++) {
      if (Date.now() - lastYield > CHECK_YIELD_MS) {
        await tick()
        lastYield = Date.now()
        throwIfCancelled(id)
      }
      specs.push(checkSpec(doc.specifications[i], elements, { modelSchema }))
      progress('check', 75 + ((i + 1) / totalSpecs) * 25)
    }

    const result = summarizeResults(doc.title, specs, modelSchema)
    post({ type: 'result', id, result: { ...result, unreadableEntities: unreadable } })
  } catch (err) {
    if (err instanceof CancelledError) {
      post({ type: 'error', id, code: 'cancelled', message: 'Check cancelled' })
    } else {
      post({ type: 'error', id, code: classifyError(err), message: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    try { if (api && modelId >= 0) api.CloseModel(modelId) } catch { /* ignore */ }
  }
}

self.onmessage = (e: MessageEvent<unknown>): void => {
  const parsed = parseIdsInMsg(e.data)
  if (!parsed.ok) {
    // Never leave the runner hanging: if the malformed payload carries an id,
    // answer with a typed error instead of dropping it silently. The Zod reason
    // rides along — the panel renders this message verbatim, and "Invalid
    // check-ids payload" is not something a user can act on. An IDS document
    // that fails validation lands here (an EIR profile with every rule ignored
    // compiles to zero specifications), and the reason is the only thing that
    // says which field was wrong.
    const raw = e.data as { type?: unknown; id?: unknown } | null
    if (raw && typeof raw.id === 'string' && raw.type === 'check-ids') {
      post({ type: 'error', id: raw.id, code: 'unknown', message: parsed.error.message })
    }
    return
  }
  const msg = parsed.data
  if (msg.type === 'cancel') {
    cancelledRuns.add(msg.id)
    return
  }
  // One check per worker lifetime (the runner spawns one worker per job). A
  // second check-ids is answered rather than dropped: this worker will never run
  // it, and a silent return would leave that caller waiting out its 120 s
  // watchdog and then blaming a timeout.
  if (checkStarted) {
    post({ type: 'error', id: msg.id, code: 'unknown', message: 'This IDS worker already ran a check — spawn a new worker per check' })
    return
  }
  checkStarted = true
  // runCheck posts its own errors, so a rejection escaping it means the error
  // reporting itself broke — which still has to be reported. An unhandled
  // rejection inside a worker does NOT fire worker.onerror, so without this the
  // main thread learns nothing at all and waits out the watchdog.
  void runCheck(msg).catch((err: unknown) => {
    try {
      post({ type: 'error', id: msg.id, code: classifyError(err), message: err instanceof Error ? err.message : String(err) })
    } catch { /* postMessage itself is gone — the runner's watchdog is the last resort */ }
  })
}

export {}
