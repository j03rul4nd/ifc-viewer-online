// Promise client for workers/asbuilt.worker.ts. One worker per run; terminated
// on result, error or abort. Input buffers are TRANSFERRED (caller loses them).

import { asBuiltTransferables, type AsBuiltPipelineInput, type AsBuiltPipelineResult } from './pipeline'

function abortError(): Error {
  return typeof DOMException !== 'undefined' ? new DOMException('As-Built run aborted', 'AbortError')
    : Object.assign(new Error('As-Built run aborted'), { name: 'AbortError' })
}

export function runAsBuiltInWorker(input: AsBuiltPipelineInput, o: { signal?: AbortSignal } = {}): Promise<AsBuiltPipelineResult> {
  if (o.signal?.aborted) return Promise.reject(abortError())
  const worker = new Worker(new URL('../../workers/asbuilt.worker.ts', import.meta.url), { type: 'module' })
  const id = crypto.randomUUID()
  return new Promise<AsBuiltPipelineResult>((resolve, reject) => {
    const done = () => { worker.terminate(); o.signal?.removeEventListener('abort', onAbort) }
    const onAbort = () => { done(); reject(abortError()) }
    o.signal?.addEventListener('abort', onAbort, { once: true })
    worker.onmessage = (e: MessageEvent<{ id: string; ok: boolean; result?: AsBuiltPipelineResult; message?: string }>) => {
      if (e.data.id !== id) return
      done()
      if (e.data.ok && e.data.result) resolve(e.data.result)
      else reject(new Error(e.data.message ?? 'As-Built worker failed'))
    }
    worker.onerror = (e) => { done(); reject(new Error(e.message || 'As-Built worker crashed')) }
    worker.postMessage({ id, input }, asBuiltTransferables(input))
  })
}
