import { describe, it, expect } from 'vitest'
import { applicablePanels, type RailContext } from './panel-rail'

const base: RailContext = { technical: true, gis: true, pointClouds: 0, meshes: 0 }

describe('applicablePanels', () => {
  it('always offers the scene panel, so the rail is never empty with a model', () => {
    // An empty rail would be 40px of nothing, and the user would learn that the
    // rail is sometimes a lie.
    expect(applicablePanels({ technical: false, gis: false, pointClouds: 0, meshes: 0 }))
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

  it('always offers properties, and offers it first', () => {
    // It is the most-used panel and the one that used to own a surface of its
    // own on this edge. If it is ever not on the rail, it is unreachable: the
    // PROPIEDADES strip that used to restore it is gone. docs/RIGHT_EDGE.md.
    for (const ctx of [
      base,
      { ...base, technical: false, gis: false },
      { ...base, pointClouds: 4, meshes: 4 },
    ]) expect(applicablePanels(ctx)[0]).toBe('properties')
  })

  it('never repeats a panel, which would put two toggles on one state', () => {
    const ids = applicablePanels({ ...base, pointClouds: 3, meshes: 3 })
    expect(new Set(ids).size).toBe(ids.length)
  })
})
