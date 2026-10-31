// ─── Brush presets ────────────────────────────────────────────────────────────
// A brush is the tool plus how it behaves, Clip Studio's sub tools in small. The
// built-in ones are named through the `brushes.*` locale keys; a user's own carry
// their name.

import type { InkSettings } from './ink'
import type { BrushKind } from './types'

export interface BrushPreset {
  id: string
  /** Set on a brush the user saved. */
  name?: string
  brush: BrushKind
  width: number
  opacity: number
  ink: InkSettings
}

export const BUILTIN_BRUSHES: readonly BrushPreset[] = [
  { id: 'technical', brush: 'pen', width: 2, opacity: 1, ink: { curve: 'firm', stabilizer: 6, entryTaper: 0, exitTaper: 0 } },
  { id: 'ink', brush: 'pen', width: 5, opacity: 1, ink: { curve: 'normal', stabilizer: 4, entryTaper: 0.5, exitTaper: 0.8 } },
  { id: 'sketch', brush: 'pencil', width: 3, opacity: 0.85, ink: { curve: 'soft', stabilizer: 1, entryTaper: 0.2, exitTaper: 0.3 } },
  { id: 'shade', brush: 'pencil', width: 9, opacity: 0.4, ink: { curve: 'soft', stabilizer: 0, entryTaper: 0.6, exitTaper: 0.6 } },
  { id: 'marker', brush: 'marker', width: 6, opacity: 1, ink: { curve: 'normal', stabilizer: 2, entryTaper: 0, exitTaper: 0 } },
]

/** Keep the palette short: oldest out, no repeats, newest first. */
export function pushRecent(recent: readonly string[], color: string, keep = 8): string[] {
  return [color, ...recent.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, keep)
}
