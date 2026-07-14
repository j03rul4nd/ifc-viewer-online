// ─── COBie extraction launcher (F5 P2) ────────────────────────────────────────
// extractCobie(modelId) fetches the IFC buffer from the model registry and
// sends it to the validator worker (`extract-cobie` — a message type, never a
// 9th worker). Mirrors takeoff.ts: dedicated worker instance, zod-validated
// messages, resolves with the result (the XLSX/report layers of P3+ consume
// it; no store is involved at this layer).

import { match } from 'ts-pattern'
import { modelRegistry } from '../model-registry'
import { createLogger } from '../logger'
import { parseValidatorMsg, type CobieExtractResult } from '../worker-schemas'
import { WorkerError, toAppError, formatDevError } from '../errors'

const log = createLogger('Cobie')

let workerInstance: Worker | null = null

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/validator.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return workerInstance
}

export function disposeCobieWorker(): void {
  workerInstance?.terminate()
  workerInstance = null
  log.debug('COBie worker disposed')
}

export type CobieExtractOutcome =
  | { ok: true; result: CobieExtractResult }
  | { ok: false; message: string }

export async function extractCobie(modelId: string): Promise<CobieExtractOutcome> {
  const buffer = modelRegistry.getBuffer(modelId)
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, message: 'No IFC buffer available for this model' }
  }

  let worker: Worker
  try {
    worker = getWorker()
  } catch (err: unknown) {
    const appErr = toAppError(err, 'WORKER_INIT_FAILED')
    log.error('COBie worker init failed:', formatDevError(appErr))
    return { ok: false, message: appErr.message }
  }

  const id = `cobie-${modelId}-${Date.now()}`
  const bufferCopy = buffer.slice(0)

  return new Promise<CobieExtractOutcome>((resolve) => {
    const cleanup = (): void => {
      worker.removeEventListener('message', handler)
      worker.removeEventListener('error', errorHandler)
    }

    const handler = (e: MessageEvent): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) {
        log.warn('COBie: dropping unrecognised worker message:', formatDevError(parsed.error))
        return
      }

      match(parsed.data)
        .with({ type: 'cobie-done' }, (msg) => {
          log.info(`COBie [${modelId}] extracted in ${msg.result.durationMs}ms — ${msg.result.rows.length} rows`)
          cleanup()
          resolve({ ok: true, result: msg.result })
        })
        .with({ type: 'error' }, (msg) => {
          log.error('COBie worker error:', msg.message)
          cleanup()
          resolve({ ok: false, message: msg.message })
        })
        .with({ type: 'tree' },         () => { /* not cobie */ })
        .with({ type: 'tree-done' },    () => { /* not cobie */ })
        .with({ type: 'partial' },      () => { /* not cobie */ })
        .with({ type: 'done' },         () => { /* not cobie */ })
        .with({ type: 'takeoff-done' }, () => { /* not cobie */ })
        .exhaustive()
    }

    const errorHandler = (e: ErrorEvent): void => {
      disposeCobieWorker()
      const err = new WorkerError(
        'WORKER_CRASHED',
        `COBie worker crashed: ${e.message}`,
        { filename: e.filename, lineno: e.lineno, colno: e.colno },
      )
      log.error('COBie worker script error:', formatDevError(err))
      cleanup()
      resolve({ ok: false, message: err.message })
    }

    worker.addEventListener('message', handler)
    worker.addEventListener('error', errorHandler)
    worker.postMessage({ type: 'extract-cobie', id, buffer: bufferCopy }, [bufferCopy])
  })
}
