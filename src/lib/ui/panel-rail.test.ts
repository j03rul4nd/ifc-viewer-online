import { describe, it, expect } from 'vitest'
import {
  applicablePanels, parsePanelAllowlist, ALL_PANEL_IDS, type RailContext,
} from './panel-rail'

const base: RailContext = { technical: true, sidebar: true, gis: true, pointClouds: 0, meshes: 0 }

describe('applicablePanels', () => {
  it('always offers the scene panel, so the rail is never empty with a model', () => {
    // An empty rail would be 40px of nothing, and the user would learn that the
    // rail is sometimes a lie.
    expect(applicablePanels({ ...base, technical: false, gis: false }))
      .toEqual(['properties', 'scene', 'solar'])
  })

  it('hides the technical tools in the client presentation skin', () => {
    // Same rule the toolbar already applies: a client seeing the model does not
    // get section planes and measurements unless the presenter enables them.
    const ids = applicablePanels({ ...base, technical: false })
    expect(ids).not.toContain('measurement')
    expect(ids).not.toContain('section')
    expect(ids).not.toContain('plans')
  })

  it('omits the map when GIS is not built in', () => {
    // The chunk is behind VITE_FEATURE_GIS; offering the icon would promise
    // something the bundle cannot deliver.
    expect(applicablePanels({ ...base, gis: false })).not.toContain('map')
  })

  it('waits for content before offering the tools that act on content', () => {
    expect(applicablePanels(base)).not.toContain('pointcloud')
    expect(applicablePanels(base)).not.toContain('mesh')
    expect(applicablePanels({ ...base, pointClouds: 1 })).toContain('pointcloud')
    expect(applicablePanels({ ...base, meshes: 2 })).toContain('mesh')
  })

  it('keeps a stable order, so an icon does not move under the cursor', () => {
    // Loading a scan must not renumber the rail: everything that was already
    // there stays where it was, and the new icon appears after it.
    const before = applicablePanels(base)
    const after = applicablePanels({ ...base, pointClouds: 1 })
    expect(after.slice(0, before.length)).toEqual(before)
  })

  it('groups the model tools before the world tools', () => {
    expect(applicablePanels({ ...base, pointClouds: 1, meshes: 1 })).toEqual([
      'properties', 'scene', 'measurement', 'section', 'plans',
      'map', 'solar', 'pointcloud', 'mesh',
    ])
  })

  it('drops properties when the chrome does not mount that column', () => {
    // Tour playback and the client skin hide the app's own furniture. An icon
    // whose panel is not in the tree is a control that does nothing when
    // pressed, which is exactly what tour mode was showing.
    const ids = applicablePanels({ ...base, sidebar: false })
    expect(ids).not.toContain('properties')
    expect(ids[0]).toBe('scene')
  })

  it('offers properties first whenever that column exists', () => {
    // It is the most-used panel and the one that used to own a surface of its
    // own on this edge. If it is ever not on the rail, it is unreachable: the
    // PROPIEDADES strip that used to restore it is gone. docs/RIGHT_EDGE.md.
    for (const ctx of [
      base,
      { ...base, technical: false, gis: false },
      { ...base, technical: false },
      { ...base, pointClouds: 4, meshes: 4 },
    ]) expect(applicablePanels(ctx)[0]).toBe('properties')
  })

  it('never repeats a panel, which would put two toggles on one state', () => {
    const ids = applicablePanels({ ...base, pointClouds: 3, meshes: 3 })
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the host allowlist', () => {
  // The seam the app scales on: every new tool is a rail icon, so a host has to
  // be able to scope the rail once and stay correct as we ship more of them.
  it('keeps only what was named', () => {
    expect(applicablePanels({ ...base, allow: ['scene', 'map'] })).toEqual(['scene', 'map'])
  })

  it('filters, and never adds', () => {
    // A host cannot conjure the point cloud panel by naming it when no scan is
    // loaded, nor re-enable a column the chrome switched off.
    expect(applicablePanels({ ...base, allow: ['pointcloud'] })).toEqual([])
    expect(applicablePanels({ ...base, sidebar: false, allow: ['properties', 'scene'] }))
      .toEqual(['scene'])
  })

  it('means all that apply when there is no opinion', () => {
    expect(applicablePanels({ ...base, allow: undefined })).toEqual(applicablePanels(base))
  })

  it('takes an empty list at its word', () => {
    // `panels=` with nothing after it is a host saying "no rail", which is not
    // the same as saying nothing.
    expect(applicablePanels({ ...base, allow: [] })).toEqual([])
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
