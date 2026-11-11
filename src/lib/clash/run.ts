// ─── run a matrix ─────────────────────────────────────────────────────────────
// collect (main thread) → engine (worker) → ClashResult with stable keys.

import type { EngineClash, EngineInput, EngineProgress } from './engine'
import type { ClashWorkerOut } from './clash.worker'
import { collectElements, type CollectModel } from './collect'
import { assemblyGroups, clashKey, selectIndexes, type ClashMatrix, type ClashResult } from './model'

export interface RunProgress {
  phase: 'collect' | 'test'
  done: number
  total: number
  test?: string
}

export interface RunOutcome {
  results: ClashResult[]
  ranTests: Set<string>
  elements: number
  triangles: number
  collectMs: number
  testMs: number
}

function inWorker(input: EngineInput & { positions: Float32Array }, onProgress: (p: EngineProgress) => void, signal?: AbortSignal): Promise<EngineClash[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./clash.worker.ts', import.meta.url), { type: 'module', name: 'clash' })
    const stop = () => { worker.terminate(); reject(new DOMException('aborted', 'AbortError')) }
    signal?.addEventListener('abort', stop, { once: true })
    worker.onmessage = (e: MessageEvent<ClashWorkerOut>) => {
      const m = e.data
      if (m.type === 'progress') { onProgress(m.progress); return }
      signal?.removeEventListener('abort', stop)
      worker.terminate()
      if (m.type === 'done') resolve(m.clashes)
      else reject(new Error(m.message))
    }
    worker.onerror = (e) => { signal?.removeEventListener('abort', stop); worker.terminate(); reject(new Error(e.message || 'clash worker failed')) }
    // The soup is handed over (transferred): nothing on this side reads it again.
    worker.postMessage(input, [input.positions.buffer])
  })
}

export async function runMatrix(models: CollectModel[], matrix: ClashMatrix, onProgress: (p: RunProgress) => void, signal?: AbortSignal): Promise<RunOutcome> {
  const tests = matrix.tests.filter((t) => t.enabled)
  const t0 = performance.now()
  const col = await collectElements(models, tests.flatMap((t) => [t.a, t.b]), (done, total) => onProgress({ phase: 'collect', done, total }), signal)
  const t1 = performance.now()
  const engineTests = tests.map((t) => ({
    id: t.id, kind: t.kind, tolerance: t.tolerance, skipSameModel: t.skipSameModel,
    a: selectIndexes(t.a, col.elements), b: selectIndexes(t.b, col.elements),
  }))
  const triangles = col.positions.length / 9
  const clashes = await inWorker(
    { positions: col.positions, offsets: col.offsets, modelIndex: col.modelIndex, group: assemblyGroups(col.elements), tests: engineTests },
    (p) => onProgress({ phase: 'test', done: p.done, total: p.total, test: p.test }),
    signal,
  )
  const results = clashes.map((c): ClashResult => {
    const a = col.elements[c.a], b = col.elements[c.b]
    return { key: clashKey(c.test, a, b), test: c.test, kind: c.kind, a, b, distance: c.distance, depth: c.depth, point: c.point }
  })
  return { results, ranTests: new Set(tests.map((t) => t.id)), elements: col.elements.length, triangles, collectMs: t1 - t0, testMs: performance.now() - t1 }
}
