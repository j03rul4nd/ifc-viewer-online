// ─── panel rail ───────────────────────────────────────────────────────────────
// Which floating panels the rail offers, and in what order. See
// docs/PANEL_RAIL.md for why the rail exists at all.
//
// This is pure so it can be reasoned about and tested without a store, a React
// tree or a DOM. The hook reads the stores, this decides, the component draws.
//
// It does NOT decide whether a panel exists. It cannot: the conditions are in
// the JSX, next to the panels themselves, and a copy of them here drifts. It
// drifted the first day — the client preset was written from memory and offered
// Scene and Map, neither of which the client skin mounts, so two of three icons
// on that rail did nothing when pressed. The caller states availability from the
// same expressions that render the panels; this module owns order and policy.

/** Every floating panel that can appear on the rail, in rail order. */
export type PanelId =
  | 'properties'
  | 'scene' | 'measurement' | 'section' | 'plans'
  | 'map' | 'solar' | 'pointcloud' | 'mesh'

export interface RailContext {
  /**
   * Which panels are mounted right now, keyed by id.
   *
   * Built beside the render conditions, so the two cannot disagree. A missing
   * key means unavailable — a new panel is invisible until it is stated, which
   * fails in the safe direction.
   */
  available: Partial<Record<PanelId, boolean>>
  /**
   * A host allowlist, or undefined for "everything available".
   *
   * This is the seam the app scales on. Every tool we add is a rail icon by the
   * rule in docs/RIGHT_EDGE.md, and a host embedding the viewer — a client
   * presentation, a kiosk, a customer's portal — needs to say which of them
   * that audience gets, without a new flag per tool being invented each time.
   */
  allow?: readonly PanelId[]
}

/** Every panel id, in rail order: the model's own tools, then the world's. */
export const ALL_PANEL_IDS: readonly PanelId[] = [
  // Properties leads: it is the most-used panel, and the one that used to have
  // a surface of its own on this edge. See docs/RIGHT_EDGE.md.
  'properties', 'scene', 'measurement', 'section', 'plans',
  'map', 'solar', 'pointcloud', 'mesh',
]

/**
 * The panels to put on the rail, in rail order.
 *
 * A panel that does not apply is OMITTED rather than disabled: on a 40px rail a
 * greyed icon is noise, and it teaches the reader nothing about how to enable
 * it. An icon whose panel is not mounted is worse still — a control that does
 * nothing when pressed.
 */
export function applicablePanels(ctx: RailContext): PanelId[] {
  return ALL_PANEL_IDS.filter((id) => ctx.available[id] === true)
    // The allowlist narrows what is available; it never adds. A host cannot
    // conjure a panel the app is not rendering by naming it.
    .filter((id) => !ctx.allow || ctx.allow.includes(id))
}

/**
 * Read an allowlist out of a `panels=` parameter.
 *
 * `panels=scene,map` allows exactly those. `panels=-measurement,-section`
 * subtracts from the full set, which is what a host usually wants: opt out of
 * two tools rather than re-list the other seven and silently miss the ones we
 * add later. The subtractive form applies only when every entry is negative.
 * Unknown names are ignored rather than failing the load — a URL written
 * against a newer build must still work on an older one.
 *
 * Returns undefined for "no opinion", which is not the same as the empty list:
 * `panels=` with nothing after it means no rail at all, and says so.
 */
export function parsePanelAllowlist(raw: string | null | undefined): PanelId[] | undefined {
  if (raw == null) return undefined
  const entries = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (entries.length === 0) return []
  if (entries.every((e) => e.startsWith('-'))) {
    const denied = new Set(entries.map((e) => e.slice(1)))
    return ALL_PANEL_IDS.filter((id) => !denied.has(id))
  }
  return ALL_PANEL_IDS.filter((id) => entries.includes(id))
}
