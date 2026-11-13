// ─── compare/kind-colours.ts ──────────────────────────────────────────────────
// One colour per kind of change, the same everywhere a change is shown
// (revision-compare 05-ux §2): list badges, 3D capture, PDF, BCF. They carry
// meaning (added = green, removed = red…), so they are fixed, not themed.
//
// 05-ux defines five categories; the other kinds take the colour of the one
// they belong to on site: a type change is a reshape (G), a relation change
// is data like a property (P).

import type { ChangeKind } from './revision-types'

export const REVISION_KIND_COLOUR: Record<ChangeKind, string> = {
  added: '#2E9E5B', // theme-allow-color: revision kind "added" (05-ux §2)
  removed: '#D64545', // theme-allow-color: revision kind "removed" (05-ux §2)
  moved: '#2F6FDE', // theme-allow-color: revision kind "moved" (05-ux §2)
  reshaped: '#E08A1E', // theme-allow-color: revision kind "reshaped" (05-ux §2)
  type_changed: '#E08A1E', // theme-allow-color: same category as reshaped (05-ux §2)
  properties_changed: '#8B5CF6', // theme-allow-color: revision kind "properties" (05-ux §2)
  relations_changed: '#8B5CF6', // theme-allow-color: same category as properties (05-ux §2)
  unchanged: '#8A9099', // theme-allow-color: unchanged = grey ghost (05-ux §2)
}

/** `RRGGBB` without '#', the way BCF writes colours. */
export function bcfColour(kind: ChangeKind): string {
  return REVISION_KIND_COLOUR[kind].slice(1).toUpperCase()
}
