import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePlyHeader } from '../src/lib/pointcloud/ply-reader'

const ASSET_DIR = resolve(__dirname, '../public/models/realtime-lidar')

const ASSETS = [
  {
    id: 'warehouse',
    ifc: 'IVO-Warehouse-Operations.ifc',
    ply: 'warehouse-operations-snapshot.ply',
    points: 39_370,
    ifcToken: 'IFCCOLUMN(',
  },
  {
    id: 'construction',
    ifc: 'IVO-Construction-Progress.ifc',
    ply: 'construction-progress-snapshot.ply',
    points: 41_016,
    ifcToken: 'IFCBEAM(',
  },
  {
    id: 'tunnel',
    ifc: 'IVO-Utility-Tunnel.ifc',
    ply: 'utility-tunnel-snapshot.ply',
    points: 49_324,
    ifcToken: 'IFCBUILDINGELEMENTPROXY(',
  },
] as const

describe('downloadable real-time LiDAR showcase assets', () => {
  it.each(ASSETS)('$id ships a labelled IFC4 companion with geometry', ({ ifc, ifcToken }) => {
    const path = resolve(ASSET_DIR, ifc)
    const content = readFileSync(path, 'utf8')

    expect(content.startsWith('ISO-10303-21;')).toBe(true)
    expect(content).toContain("FILE_SCHEMA(('IFC4'))")
    expect(content).toContain('Pset_RealtimeLidarDemo')
    expect(content).toContain("'SyntheticAsset',$,IFCBOOLEAN(.T.)")
    expect(content).toContain(ifcToken)
    expect(statSync(path).size).toBeGreaterThan(15_000)
  })

  it.each(ASSETS)('$id ships a bounded binary PLY snapshot with sensor attributes', ({ ifc, ply, points }) => {
    const bytes = readFileSync(resolve(ASSET_DIR, ply))
    const headerText = bytes.subarray(0, Math.min(bytes.length, 4_096)).toString('latin1')
    const header = parsePlyHeader(headerText)
    const vertices = header.elements.find((element) => element.name === 'vertex')

    expect(header.encoding).toBe('binary_little_endian')
    expect(headerText).toContain('Synthetic example; not a physical sensor capture')
    expect(headerText).toContain(`Companion IFC ${ifc}`)
    expect(vertices?.count).toBe(points)
    expect(vertices?.stride).toBe(17)
    expect(vertices?.properties.map((property) => property.name)).toEqual([
      'x', 'y', 'z', 'red', 'green', 'blue', 'intensity', 'classification',
    ])
    expect(bytes.length).toBe(header.dataOffset + points * 17)
  })
})
