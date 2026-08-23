// ─── one catalogue, two forms ─────────────────────────────────────────────────
// The desktop rail and the mobile tools sheet must offer the same tools.
//
// They did not. Counted on a 390x844 viewport with a model loaded, the sheet
// offered four — measure, section, plans, scene — while the rail offered seven,
// and Map, Sun, Point cloud and Mesh had no mobile entry point at all. The sheet
// was a hand-written grid in a different file: a second copy of "what tools
// exist", which had already drifted four behind. docs/MOBILE_TOOLS.md.
//
// These assert the property that stops it drifting again: both surfaces read one
// list, so neither can fall behind the other.

import { describe, it, expect } from 'vitest'
import { applicablePanels, ALL_PANEL_IDS, type PanelId } from './panel-rail'

const all = (): Record<PanelId, boolean> =>
  Object.fromEntries(ALL_PANEL_IDS.map((id) => [id, true])) as Record<PanelId, boolean>

/** What the mobile sheet shows: the catalogue, minus the one device difference. */
function mobileTools(ids: PanelId[]): PanelId[] {
  return ids.filter((id) => id !== 'properties')
}

describe('the mobile sheet and the rail agree', () => {
  it('offers every tool the rail offers, bar properties', () => {
    // Properties is the one honest exception: the bottom nav already has a tab
    // for it, and the rail item toggles the desktop column's flag.
    const rail = applicablePanels({ available: all() })
    expect(mobileTools(rail)).toEqual(rail.filter((id) => id !== 'properties'))
    expect(mobileTools(rail)).toHaveLength(rail.length - 1)
  })

  it('reaches the four tools that had no mobile entry point at all', () => {
    // The measured regression, named outright so it cannot come back quietly.
    const mobile = mobileTools(applicablePanels({ available: all() }))
    for (const id of ['map', 'solar', 'pointcloud', 'mesh'] as PanelId[]) {
      expect(mobile, id).toContain(id)
    }
  })

  it('hides a tool on both surfaces or neither', () => {
    // A panel absent on one and dead on the other is the failure this replaces.
    const available = { ...all(), map: false, pointcloud: false }
    const rail = applicablePanels({ available })
    expect(rail).not.toContain('map')
    expect(mobileTools(rail)).not.toContain('map')
    expect(mobileTools(rail)).not.toContain('pointcloud')
  })

  it('picks up a tool added later without either surface being edited', () => {
    // The whole point: state a new panel's availability once, and it appears on
    // the rail and in the sheet the same day.
    const before = mobileTools(applicablePanels({ available: { scene: true } }))
    const after = mobileTools(applicablePanels({ available: { scene: true, solar: true } }))
    expect(before).toEqual(['scene'])
    expect(after).toEqual(['scene', 'solar'])
  })

  it('honours the host allowlist on mobile too', () => {
    // Otherwise a kiosk locked down for a client leaks its tools on a phone.
    const rail = applicablePanels({ available: all(), allow: ['scene', 'solar'] })
    expect(mobileTools(rail)).toEqual(['scene', 'solar'])
  })
})
