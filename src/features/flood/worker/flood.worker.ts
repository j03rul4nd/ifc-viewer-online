// ─── flood worker ─────────────────────────────────────────────────────────────
// Owns one solver and runs it in batches, off the main thread. The viewer keeps
// its frame rate: the main thread only uploads the display frames this worker
// posts (≤ 15 per second) and draws them.
//
// BATCHES. A batch is N steps recorded at once (the GPU decides each step's
// length itself). N adapts so a batch takes ~BUDGET_MS of wall time: long
// enough that per-batch overhead is noise, short enough to stay responsive to
// pause and to share the GPU with the viewer's own rendering.
//
// PACING. At a finite speed (simulated s per wall s) the run aims each batch at
// the simulated time the clock says it should have reached; at 'max' it aims at
// the end of the event.

import type { FloodSolver } from '../core/solver-api'
import { createFloodSolver } from '../gpu/create'
import type { FromWorker, RunPerf, ToWorker } from './protocol'

const BUDGET_MS = 14
const FRAME_INTERVAL_MS = 66
const STATS_INTERVAL_MS = 100
const MAX_BATCH = 4096

const post = (m: FromWorker, transfer: Transferable[] = []): void => (self as unknown as Worker).postMessage(m, transfer)

let solver: FloodSolver | null = null
let endS = 0
let running = false
let speed: number | 'max' = 'max'
let loopToken = 0
let batch = 8
let simT = 0
let lastDt = 1
let wallAnchor = 0
let simAnchor = 0
let lastFrame = 0
let lastStats = 0
let perf: RunPerf = { stepsPerSecond: 0, speedup: 0, batchMs: 0, batchSteps: 0 }
let busy: Promise<void> = Promise.resolve()
/** A play that arrived while the solver was still being created. */
let pendingPlay: number | 'max' | null = null

/** Serialises every solver call: a frame request never interleaves with a batch. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = busy.then(fn)
  busy = run.then(() => undefined, () => undefined)
  return run
}

const fail = (err: unknown): void => {
  running = false
  post({ type: 'error', message: (err as Error)?.message ?? String(err) })
  post({ type: 'state', running: false, finished: false })
}

async function sendFrame(): Promise<void> {
  if (!solver) return
  const data = await solver.displayFrame()
  post({ type: 'frame', t: simT, nx: solver.grid.nx, ny: solver.grid.ny, data }, [data.buffer])
}

async function sendStats(): Promise<void> {
  if (!solver) return
  const stats = await solver.stats()
  post({ type: 'stats', stats, perf })
}

async function loop(token: number): Promise<void> {
  const yieldTurn = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
  while (running && token === loopToken && solver) {
    const s = solver
    const now = performance.now()
    let target = endS
    if (speed !== 'max') target = Math.min(endS, simAnchor + ((now - wallAnchor) / 1000) * speed)
    if (target <= simT + 1e-3) {
      if (simT >= endS - 1e-3) break
      // Ahead of the clock: wait for it.
      await new Promise((r) => setTimeout(r, 8))
      continue
    }
    const want = Math.max(1, Math.min(batch, Math.ceil((target - simT) / Math.max(lastDt, 1e-3)) + 1))
    const t0 = performance.now()
    const tBefore = simT
    const r = await exclusive(() => s.advance(target, want))
    const ms = performance.now() - t0
    if (token !== loopToken) return
    simT = r.t
    if (r.dt > 0) lastDt = r.dt
    // Grow or shrink the batch towards the time budget.
    if (r.steps >= want - 1) batch = Math.min(MAX_BATCH, Math.max(1, Math.round(batch * Math.min(2, Math.max(0.5, BUDGET_MS / Math.max(ms, 0.5))))))
    perf = {
      stepsPerSecond: 0.7 * perf.stepsPerSecond + 0.3 * ((r.steps * 1000) / Math.max(ms, 0.01)),
      speedup: 0.7 * perf.speedup + 0.3 * (((r.t - tBefore) * 1000) / Math.max(ms, 0.01)),
      batchMs: ms,
      batchSteps: r.steps,
    }
    const t = performance.now()
    if (t - lastStats > STATS_INTERVAL_MS) {
      lastStats = t
      await exclusive(sendStats)
    }
    if (t - lastFrame > FRAME_INTERVAL_MS) {
      lastFrame = t
      await exclusive(sendFrame)
    }
    await yieldTurn()
  }
  if (token !== loopToken || !solver) return
  const finished = simT >= endS - 1e-3
  running = false
  await exclusive(sendStats)
  await exclusive(sendFrame)
  post({ type: 'state', running: false, finished })
}

function start(sp: number | 'max'): void {
  speed = sp
  wallAnchor = performance.now()
  simAnchor = simT
  if (running) return
  running = true
  post({ type: 'state', running: true, finished: false })
  const token = ++loopToken
  void loop(token).catch(fail)
}

self.onmessage = (e: MessageEvent<ToWorker>): void => {
  const m = e.data
  switch (m.type) {
    case 'init':
      void (async () => {
        try {
          loopToken++
          running = false
          pendingPlay = null
          solver?.dispose()
          solver = null
          const made = await createFloodSolver(
            { grid: m.grid, hyetograph: m.hyetograph, params: m.params },
            { backend: m.backend, powerPreference: m.powerPreference },
          )
          solver = made.solver
          endS = m.endS
          simT = 0
          batch = 8
          post({ type: 'ready', backend: made.solver.backend, device: made.device, fallbackReason: made.fallbackReason })
          await exclusive(sendStats)
          await exclusive(sendFrame)
          if (pendingPlay !== null) {
            const sp = pendingPlay
            pendingPlay = null
            start(sp)
          }
        } catch (err) { fail(err) }
      })()
      break
    case 'play':
      if (!solver) pendingPlay = m.speed
      else start(m.speed)
      break
    case 'pause':
      pendingPlay = null
      if (running) {
        running = false
        loopToken++
        post({ type: 'state', running: false, finished: false })
      }
      break
    case 'frame':
      void exclusive(sendFrame).catch(fail)
      break
    case 'max':
      void exclusive(async () => {
        if (!solver) return
        const fields = await solver.maxFields()
        post({ type: 'max', fields }, [fields.hMax.buffer, fields.vMax.buffer, fields.tPeak.buffer, fields.tWet.buffer] as ArrayBuffer[])
      }).catch(fail)
      break
    case 'dispose':
      loopToken++
      running = false
      void exclusive(async () => { solver?.dispose(); solver = null })
      break
  }
}
