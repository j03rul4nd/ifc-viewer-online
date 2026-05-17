// ─── Quantity takeoff launcher ─────────────────────────────────────────────────
// computeTakeoff(modelId) fetches the IFC buffer from the model registry
// and sends it to the validator worker. Results are stored per-model in
// takeoffStore.byModel so multiple models can have independent takeoffs.

import { match } from 'ts-pattern'
import { modelRegistry }  from './model-registry'
import { useTakeoffStore } from '../stores/takeoffStore'
import { createLogger }    from './logger'
import { parseValidatorMsg } from './worker-schemas'
import { TakeoffError, WorkerError, toAppError, formatDevError } from './errors'

const log = createLogger('Takeoff')

let workerInstance: Worker | null = null

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/validator.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return workerInstance
}

export function disposeTakeoffWorker(): void {
  workerInstance?.terminate()
  workerInstance = null
  log.debug('Takeoff worker disposed')
}

export async function computeTakeoff(modelId: string): Promise<void> {
  const { setModelStatus, setModelResult } = useTakeoffStore.getState()

  const buffer = modelRegistry.getBuffer(modelId)
  if (!buffer || buffer.byteLength === 0) {
    const err = new TakeoffError('TAKEOFF_FAILED', 'No IFC buffer available for this model')
    log.warn(formatDevError(err))
    setModelStatus(modelId, 'error', err.message)
    return
  }

  const current = useTakeoffStore.getState().byModel[modelId]?.status
  if (current === 'running') return

  setModelStatus(modelId, 'running')

  let worker: Worker
  try {
    worker = getWorker()
  } catch (err: unknown) {
    const appErr = toAppError(err, 'WORKER_INIT_FAILED')
    log.error('Takeoff worker init failed:', formatDevError(appErr))
    setModelStatus(modelId, 'error', appErr.message)
    return
  }

  const id = `takeoff-${modelId}-${Date.now()}`
  const bufferCopy = buffer.slice(0)

  return new Promise<void>((resolve) => {
    const cleanup = (): void => {
      worker.removeEventListener('message', handler)
      worker.removeEventListener('error',   errorHandler)
    }

    const handler = (e: MessageEvent): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) {
        log.warn('Takeoff: dropping unrecognised worker message:', formatDevError(parsed.error))
        return
      }

      match(parsed.data)
        .with({ type: 'takeoff-done' }, (msg) => {
          log.info(`Takeoff [${modelId}] complete in ${msg.result.durationMs}ms — ${msg.result.groups.length} groups`)
          setModelResult(modelId, msg.result)
          cleanup()
          resolve()
        })
        .with({ type: 'error' }, (msg) => {
          const err = new TakeoffError('TAKEOFF_FAILED', msg.message)
          log.error('Takeoff worker error:', formatDevError(err))
          setModelStatus(modelId, 'error', msg.message)
          cleanup()
          resolve()
        })
        .with({ type: 'tree' },      () => { /* not takeoff */ })
        .with({ type: 'tree-done' }, () => { /* not takeoff */ })
        .with({ type: 'partial' },   () => { /* not takeoff */ })
        .with({ type: 'done' },      () => { /* not takeoff */ })
        .exhaustive()
    }

    const errorHandler = (e: ErrorEvent): void => {
      disposeTakeoffWorker()
      const err = new WorkerError(
        'WORKER_CRASHED',
        `Takeoff worker crashed: ${e.message}`,
        { filename: e.filename, lineno: e.lineno, colno: e.colno },
      )
      log.error('Takeoff worker script error:', formatDevError(err))
      setModelStatus(modelId, 'error', err.message)
      cleanup()
      resolve()
    }

    worker.addEventListener('message', handler)
    worker.addEventListener('error',   errorHandler)
    worker.postMessage({ type: 'compute-takeoff', id, buffer: bufferCopy }, [bufferCopy])
  })
}
