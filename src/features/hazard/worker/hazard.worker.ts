// ─── hazard worker ───────────────────────────────────────────────────────────
// Runs the storm sweep off the main thread (Monte Carlo per cell per step is
// the heavy part) and streams quantised frames back.

import { runHazard } from '../core/storm'
import { P_DRY, P_NONE, type FromHazardWorker, type ToHazardWorker } from './protocol'

const post = (m: FromHazardWorker, transfer: Transferable[] = []): void =>
  (self as unknown as Worker).postMessage(m, transfer)

self.onmessage = (e: MessageEvent<ToHazardWorker>) => {
  if (e.data.type !== 'run') return
  const req = e.data.req
  try {
    const of = req.cumRainMm.length
    const res = runHazard({
      ...req,
      keepSteps: false,
      onStep(k, step) {
        const n = step.pFail.length
        const pFail = new Uint8Array(n)
        const runoff = new Uint16Array(n)
        const debris = new Uint8Array(n)
        for (let c = 0; c < n; c++) {
          const p = step.pFail[c]
          pFail[c] = Number.isNaN(p) ? P_NONE : step.dryUnstable[c] ? P_DRY : Math.round(p * 250)
          const q = step.runoffMm[c]
          runoff[c] = Number.isNaN(q) ? 0 : Math.min(65535, Math.round(q * 10))
          debris[c] = (step.debrisPath[c] > 0 ? 1 : 0) | (step.debrisDeposit[c] > 0 ? 2 : 0)
        }
        post({ type: 'frame', of, frame: { k, rainMm: step.rainMm, pFail, runoff, debris } }, [pFail.buffer, runoff.buffer, debris.buffer])
      },
    })
    let dry = 0
    for (const v of res.dryUnstable) dry += v
    post({ type: 'done', critical: res.critical, slope: res.slope, dryCells: dry }, [res.slope.buffer])
  } catch (err) {
    post({ type: 'error', message: (err as Error)?.message ?? String(err) })
  }
}
