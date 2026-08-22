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
  /**
   * Whether the properties column is mounted at all.
   *
   * The embed chrome and the client skin can switch it off, and during tour
   * playback the app hides its own furniture. An icon for a panel that is not
   * in the tree is a control that does nothing when pressed — which is what
   * tour mode was showing.
   */
  sidebar: boolean
  /** Content gates: these two act ON something, so they wait for it. */
  pointClouds: number
  meshes: number
  /**
   * An explicit allowlist, or undefined for "whatever else applies".
   *
   * This is the seam the app scales on. Every tool we add is a rail icon by the
   * rule in docs/RIGHT_EDGE.md, and a host embedding the viewer — a client
   * presentation, a kiosk, a customer's portal — needs to say which of them
   * that audience gets, without a new flag per tool being invented each time.
   * One list, and a tool added next year is covered by it the day it ships.
   */
  allow?: readonly PanelId[]
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
  const ids: PanelId[] = []
  if (ctx.sidebar) ids.push('properties')
  ids.push('scene')
  // Grouped by kind rather than alphabetically, so the rail reads as
  // "the model" then "the world": measure/cut/plan, then map/sun/scans.
  if (ctx.technical) ids.push('measurement', 'section', 'plans')
  if (ctx.gis) ids.push('map')
  ids.push('solar')
  if (ctx.pointClouds > 0) ids.push('pointcloud')
  if (ctx.meshes > 0) ids.push('mesh')

  // The allowlist filters what applies; it never adds. A host cannot conjure
  // the point cloud panel by naming it when no scan is loaded, and cannot
  // re-enable a panel the chrome switched off.
  return ctx.allow ? ids.filter((id) => ctx.allow!.includes(id)) : ids
}

/** Every panel id, for validating an allowlist that came in from a URL. */
export const ALL_PANEL_IDS: readonly PanelId[] = [
  'properties', 'scene', 'measurement', 'section', 'plans',
  'map', 'solar', 'pointcloud', 'mesh',
]

/**
 * Read an allowlist out of a `panels=` parameter.
 *
 * `panels=scene,map` allows exactly those. `panels=-measurement,-section`
 * subtracts from the full set, which is what a host usually wants: opt out of
 * two tools rather than re-list the other seven and silently miss the ones we
 * add later. Mixing the two forms is a mistake, so the subtractive form wins
 * only when every entry is negative. Unknown names are ignored rather than
 * failing the load — a URL written against a newer build must still work.
 *
 * Returns undefined for "no opinion", which is not the same as the empty list:
 * `panels=` with nothing after it means no rail at all, and says so.
 */
export function parsePanelAllowlist(raw: string | null | undefined): PanelId[] | undefined {
  if (raw == null) return undefined
  const entries = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (entries.length === 0) return []
  const subtractive = entries.every((e) => e.startsWith('-'))
  if (subtractive) {
    const denied = new Set(entries.map((e) => e.slice(1)))
    return ALL_PANEL_IDS.filter((id) => !denied.has(id))
  }
  return ALL_PANEL_IDS.filter((id) => entries.includes(id))
}
