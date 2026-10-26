// ─── hazard worker protocol ──────────────────────────────────────────────────
// The run is posted once; the worker answers with one compact frame per rain
// step and the critical-rain table at the end. Frames are quantised so a
// 250 000-cell grid over 40 steps stays around 40 MB:
//   pFail   Uint8   P(failure) × 250, 254 = fails before any rain, 255 = not assessed
//   runoff  Uint16  event runoff in tenths of a mm (capped)
//   debris  Uint8   bit 0 = a debris path crosses, bit 1 = deposit

import type { HazardInput, CriticalRain } from '../core/storm'

export type HazardRunRequest = Omit<HazardInput, 'onStep' | 'keepSteps'>

export interface HazardFrame {
  k: number
  rainMm: number
  pFail: Uint8Array
  runoff: Uint16Array
  debris: Uint8Array
}

export type ToHazardWorker = { type: 'run'; req: HazardRunRequest }

export type FromHazardWorker =
  | { type: 'frame'; frame: HazardFrame; of: number }
  | { type: 'done'; critical: CriticalRain[]; slope: Float32Array; dryCells: number }
  | { type: 'error'; message: string }

export const P_NONE = 255
export const P_DRY = 254
