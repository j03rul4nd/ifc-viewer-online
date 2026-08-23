// ─── panel commands ───────────────────────────────────────────────────────────
// The host-facing vocabulary for the panel rail.
//
// The SDK could drive almost everything about the viewer — models, point clouds,
// meshes, IDS, validation, the camera — and nothing at all about the surfaces a
// person actually looks at. A host embedding the viewer in a CDE could load a
// scan but could not open the panel that configures it, could not ask which tool
// the user had open, and could not scope the rail for a client audience without
// reloading the iframe with a different `panels=` URL.
//
// This is the missing half, kept pure so the message router and the SDK share
// one definition of what a command means rather than agreeing by hand.

import { ALL_PANEL_IDS, type PanelId } from './panel-rail'

export type { PanelId }

/** A panel id, or null for "close whatever is open". */
export type PanelTarget = PanelId | null

/**
 * Validate a panel id arriving from outside.
 *
 * A host can send anything. An unknown id is ignored rather than throwing:
 * the same reason `panels=` ignores unknown names — a page written against a
 * newer build must keep working against an older one.
 */
export function parsePanelTarget(value: unknown): PanelTarget | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const id = value.trim().toLowerCase()
  return (ALL_PANEL_IDS as readonly string[]).includes(id) ? (id as PanelId) : undefined
}

/**
 * Validate an allowlist arriving from outside.
 *
 * Accepts the array form a script would send and the comma string a URL would.
 * Returns undefined for "not a list", which the caller reads as "no change" —
 * distinct from an empty array, which means "no rail".
 */
export function parsePanelList(value: unknown): PanelId[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null
  if (!raw) return undefined
  const wanted = new Set(raw.map((v) => String(v).trim().toLowerCase()))
  return ALL_PANEL_IDS.filter((id) => wanted.has(id))
}
