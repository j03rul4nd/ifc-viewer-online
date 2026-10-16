import { describe, expect, it } from 'vitest'
import { resolveBuildingHeight, DATA_SOURCE_TAG, ROOF_LEVEL_M } from './buildings'
import { buildHeightPrior, type HeightSample } from './height-prior'
import { parseOsmFeatures } from './osm-features'
import { omtTags } from './omt-fallback'

describe('height provenance', () => {
  it('says who measured it', () => {
    expect(resolveBuildingHeight({ building: 'yes', height: '21' }).source).toBe('osm')
    expect(resolveBuildingHeight({ building: 'yes', height: '21', [DATA_SOURCE_TAG]: 'openmaptiles' }).source).toBe('openmaptiles')
    expect(resolveBuildingHeight({ building: 'yes', [DATA_SOURCE_TAG]: 'overture' }).source).toBe('default')
    expect(resolveBuildingHeight({ building: 'yes', 'building:levels': '5' }).source).toBe('osm')
  })
  it('tells a district prior from a global constant', () => {
    const samples: HeightSample[] = Array.from({ length: 10 }, () => ({ type: 'yes', areaM2: 300, heightM: 22 }))
    const prior = buildHeightPrior(samples)
    const h = resolveBuildingHeight({ building: 'yes' }, prior, 300)
    expect(h).toMatchObject({ heightM: 22, basis: 'guess', source: 'prior' })
  })
  it('marks every OpenMapTiles building with its feed', () => {
    expect(omtTags({ layer: 'building', type: 3, props: { render_height: 30 } })).toMatchObject({ [DATA_SOURCE_TAG]: 'openmaptiles' })
  })
})

describe('storey and roof tags', () => {
  it('adds counted roof storeys and reads the Simple-3D min keys', () => {
    const h = resolveBuildingHeight({ building: 'apartments', 'building:levels': '6', 'roof:levels': '1', min_level: '1' })
    expect(h.heightM).toBeCloseTo(6 * 3.2 + ROOF_LEVEL_M, 5)
    expect(h.minHeightM).toBeCloseTo(3.2, 5)
    expect(resolveBuildingHeight({ 'building:part': 'yes', height: '30', 'building:min_height': '10' }).minHeightM).toBe(10)
  })
  it('gives a counted attic its roof height', () => {
    const [b] = parseOsmFeatures({ elements: [{ type: 'way', id: 1, tags: { building: 'yes', 'roof:shape': 'gabled', 'roof:levels': '2' },
      geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0002 }, { lat: 0.0002, lon: 0.0002 }, { lat: 0.0002, lon: 0 }, { lat: 0, lon: 0 }] }] })
    expect(b.style.roofHeightM).toBeCloseTo(2 * ROOF_LEVEL_M, 5)
  })
})

describe('height prior learns only from real measurements', () => {
  it('converts storey-only buildings with the storey height it measured', () => {
    // Eight towers state height AND levels: 4.4 m a storey.
    const both: HeightSample[] = Array.from({ length: 8 }, () => ({ type: 'office', areaM2: 2000, heightM: 88, levels: 20 }))
    const counted: HeightSample[] = Array.from({ length: 8 }, () => ({ type: 'office', areaM2: 2000, heightM: 64, levels: 20, fromLevels: true }))
    const prior = buildHeightPrior([...counted])
    expect(prior.heightFor('office', 2000)).toBeCloseTo(20 * 3.2, 5)
    const learned = buildHeightPrior([...both, ...counted])
    expect(learned.heightFor('office', 2000)).toBeCloseTo(88, 5)
  })
  it('ignores heights flagged as estimated', () => {
    const els = Array.from({ length: 12 }, (_, i) => ({
      type: 'way', id: i + 1, tags: { building: 'yes', height: '60', 'note:height': 'estimated' },
      geometry: [{ lat: 0, lon: i * 0.001 }, { lat: 0, lon: i * 0.001 + 0.0002 }, { lat: 0.0002, lon: i * 0.001 + 0.0002 }, { lat: 0.0002, lon: i * 0.001 }, { lat: 0, lon: i * 0.001 }],
    }))
    const untagged = { type: 'way', id: 99, tags: { building: 'yes' },
      geometry: [{ lat: 0.01, lon: 0 }, { lat: 0.01, lon: 0.0002 }, { lat: 0.0102, lon: 0.0002 }, { lat: 0.0102, lon: 0 }, { lat: 0.01, lon: 0 }] }
    const out = parseOsmFeatures({ elements: [...els, untagged] })
    const b = out.find((f) => f.id === 'w99')!
    expect(b.height.source).toBe('default')
    expect(b.height.heightM).not.toBe(60)
  })
})
