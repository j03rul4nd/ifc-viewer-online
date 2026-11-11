// ─── clash worker ─────────────────────────────────────────────────────────────
// Runs the engine off the main thread. One message in, progress + one result out.

import { runClashTests, type EngineInput, type EngineClash, type EngineProgress } from './engine'

export type ClashWorkerIn = EngineInput
export type ClashWorkerOut =
  | { type: 'progress'; progress: EngineProgress }
  | { type: 'done'; clashes: EngineClash[]; ms: number }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<ClashWorkerIn>) => {
  const t0 = performance.now()
  try {
    const clashes = runClashTests(e.data, (progress) => (self as unknown as Worker).postMessage({ type: 'progress', progress } satisfies ClashWorkerOut))
    ;(self as unknown as Worker).postMessage({ type: 'done', clashes, ms: performance.now() - t0 } satisfies ClashWorkerOut)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ClashWorkerOut)
  }
}
