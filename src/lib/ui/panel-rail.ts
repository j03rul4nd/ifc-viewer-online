// ─── panel rail ───────────────────────────────────────────────────────────────
// Which floating panels the rail offers, and in what order. See
// docs/PANEL_RAIL.md for why the rail exists at all.
//
// This is pure so it can be reasoned about and tested without a store, a React
// tree or a DOM. The hook reads the stores, this decides, the component draws.

/** Every floating panel that can appear on the rail, in rail order. */
export type PanelId =
  | 'properties'
  | 'scene' | 'measurement' | 'section' | 'plans'
  | 'map' | 'solar' | 'pointcloud' | 'mesh'

export interface RailContext {
  /** False in the client presentation skin, which hides the technical tools. */
  technical: boolean
  /** Build-time feature flag; an icon for a chunk that never loads is a lie. */
  gis: boolean
  /** Content gates: these two act ON something, so they wait for it. */
  pointClouds: number
  meshes: number
}

/**
 * The panels that apply right now.
 *
 * A panel that does not apply is OMITTED rather than disabled: on a 40px rail a
 * greyed icon is noise, and it teaches the reader nothing about how to enable it.
 */
export function applicablePanels(ctx: RailContext): PanelId[] {
  // Properties leads: it is the most-used panel in the app, and it is the one
  // that used to have a surface of its own — a vertical PROPIEDADES strip that
  // did exactly what a rail icon does, in the same 60px. See docs/RIGHT_EDGE.md.
  const ids: PanelId[] = ['properties', 'scene']
  // Grouped by kind rather than alphabetically, so the rail reads as
  // "the model" then "the world": measure/cut/plan, then map/sun/scans.
  if (ctx.technical) ids.push('measurement', 'section', 'plans')
  if (ctx.gis) ids.push('map')
  ids.push('solar')
  if (ctx.pointClouds > 0) ids.push('pointcloud')
  if (ctx.meshes > 0) ids.push('mesh')
  return ids
}
