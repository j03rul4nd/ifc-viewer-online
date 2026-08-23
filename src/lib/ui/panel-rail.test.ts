import { describe, it, expect } from 'vitest'
import {
  applicablePanels, parsePanelAllowlist, ALL_PANEL_IDS, type PanelId,
} from './panel-rail'

/** Everything mounted — the plain desktop app with a scan and a mesh loaded. */
const all = (): Record<PanelId, boolean> =>
  Object.fromEntries(ALL_PANEL_IDS.map((id) => [id, true])) as Record<PanelId, boolean>

describe('applicablePanels', () => {
  it('offers exactly what the app says it is rendering', () => {
    expect(applicablePanels({ available: all() })).toEqual([...ALL_PANEL_IDS])
  })

  it('never offers an icon for a panel that is not mounted', () => {
    // The bug this exists to stop: in the client skin the rail showed Scene and
    // Map, neither of which that skin mounts, so pressing them did nothing.
    const ids = applicablePanels({
      available: { ...all(), scene: false, map: false, plans: false },
    })
    expect(ids).not.toContain('scene')
    expect(ids).not.toContain('map')
    expect(ids).not.toContain('plans')
    expect(ids).toContain('solar')
  })

  it('treats a panel it has never heard of as unavailable', () => {
    // A key missing entirely, which is what a newly added panel looks like
    // before anyone states it. Failing invisible beats failing dead.
    expect(applicablePanels({ available: { scene: true } })).toEqual(['scene'])
  })

  it('ignores a key set to anything other than true', () => {
    // `undefined` from an unresolved flag must not read as available.
    const available = { ...all(), mesh: undefined as unknown as boolean }
    expect(applicablePanels({ available })).not.toContain('mesh')
  })

  it('puts properties first and keeps the model tools before the world tools', () => {
    expect(applicablePanels({ available: all() })).toEqual([
      'properties', 'scene', 'measurement', 'section', 'plans',
      'map', 'solar', 'pointcloud', 'mesh',
    ])
  })

  it('keeps a stable order, so an icon does not move under the cursor', () => {
    // Loading a scan must not renumber the rail: what was there stays where it
    // was, and the new icon appears after it.
    const before = applicablePanels({ available: { ...all(), pointcloud: false, mesh: false } })
    const after = applicablePanels({ available: { ...all(), mesh: false } })
    expect(after.slice(0, before.length)).toEqual(before)
  })

  it('never repeats a panel, which would put two toggles on one state', () => {
    const ids = applicablePanels({ available: all() })
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the host allowlist', () => {
  // The seam the app scales on: every new tool is a rail icon, so a host has to
  // be able to scope the rail once and stay correct as we ship more of them.
  it('keeps only what was named', () => {
    expect(applicablePanels({ available: all(), allow: ['scene', 'map'] }))
      .toEqual(['scene', 'map'])
  })

  it('narrows, and never adds', () => {
    // A host cannot conjure a panel the app is not rendering by naming it.
    expect(applicablePanels({ available: { ...all(), pointcloud: false }, allow: ['pointcloud'] }))
      .toEqual([])
  })

  it('means everything available when there is no opinion', () => {
    expect(applicablePanels({ available: all(), allow: undefined }))
      .toEqual(applicablePanels({ available: all() }))
  })

  it('takes an empty list at its word', () => {
    // `panels=` with nothing after it is a host saying "no rail", which is not
    // the same as saying nothing.
    expect(applicablePanels({ available: all(), allow: [] })).toEqual([])
  })
})

describe('parsePanelAllowlist', () => {
  it('has no opinion when the parameter is absent', () => {
    expect(parsePanelAllowlist(null)).toBeUndefined()
    expect(parsePanelAllowlist(undefined)).toBeUndefined()
  })

  it('reads a positive list', () => {
    expect(parsePanelAllowlist('scene,map')).toEqual(['scene', 'map'])
  })

  it('subtracts when every entry is negative', () => {
    // The form a host usually wants: opt two tools out rather than re-list the
    // other seven and silently miss the ones we add next year.
    const ids = parsePanelAllowlist('-measurement,-section')
    expect(ids).not.toContain('measurement')
    expect(ids).not.toContain('section')
    expect(ids).toContain('scene')
    expect(ids).toHaveLength(ALL_PANEL_IDS.length - 2)
  })

  it('ignores names it does not know, rather than failing the load', () => {
    // A URL written against a newer build must still open on an older one.
    expect(parsePanelAllowlist('scene,teleporter')).toEqual(['scene'])
  })

  it('is forgiving about spacing and case', () => {
    expect(parsePanelAllowlist(' Scene , MAP ')).toEqual(['scene', 'map'])
  })

  it('returns the rail order, not the order the host typed', () => {
    // Otherwise two hosts asking for the same tools get different rails.
    expect(parsePanelAllowlist('map,scene')).toEqual(parsePanelAllowlist('scene,map'))
  })

  it('treats an empty value as an explicit no', () => {
    expect(parsePanelAllowlist('')).toEqual([])
  })
})
