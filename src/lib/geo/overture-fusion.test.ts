import { describe, expect, it } from 'vitest'
import { fuseOvertureAttributes, overtureFootprintTags, HEIGHT_SOURCE_TAG } from './overture-footprints'
import { resolveBuildingHeight, DATA_SOURCE_TAG } from './buildings'

describe('Overture field-level fusion', () => {
  it('fills a height OSM left blank, and says whose it is', () => {
    const tags: Record<string, string> = { building: 'yes' }
    fuseOvertureAttributes(tags, { tags: { height: '16.69' }, src: ['Microsoft ML Buildings'] })
    expect(tags.height).toBe('16.69')
    expect(tags[HEIGHT_SOURCE_TAG]).toBe('overture')
    expect(tags['source:overture']).toBe('Microsoft ML Buildings')
    const h = resolveBuildingHeight(tags)
    expect(h).toMatchObject({ heightM: 16.69, source: 'overture', estimated: true, basis: 'height' })
  })
  it('never overrides what OSM states — a storey count owns the height', () => {
    const counted: Record<string, string> = { building: 'apartments', 'building:levels': '6' }
    expect(fuseOvertureAttributes(counted, { tags: { height: '40' } })).toEqual({})
    expect(counted.height).toBeUndefined()
    const measured: Record<string, string> = { building: 'yes', height: '21', 'roof:shape': 'flat' }
    fuseOvertureAttributes(measured, { tags: { height: '40', 'roof:shape': 'gabled', 'roof:colour': '#aa5533' } })
    expect(measured).toMatchObject({ height: '21', 'roof:shape': 'flat', 'roof:colour': '#aa5533' })
    expect(resolveBuildingHeight(measured).source).toBe('osm')
  })
  it('turns an Overture-only building into tags, heights flagged estimated', () => {
    const t = overtureFootprintTags({ id: 'x', ring: [], tags: { height: '12', 'building:levels': '4' }, src: ['Esri'] })
    expect(t).toMatchObject({ building: 'yes', height: '12', 'building:levels': '4', 'note:height': 'estimated', 'source:overture': 'Esri' })
    expect(resolveBuildingHeight({ ...t, [DATA_SOURCE_TAG]: 'overture' }).source).toBe('overture')
  })
})
