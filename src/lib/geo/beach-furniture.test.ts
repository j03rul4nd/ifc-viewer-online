import { describe, expect, it } from 'vitest'
import { classifyFeature, courtNet, furnitureKindOf, type OsmFeature } from './osm-features'
import { planFurniture } from './street-furniture'

describe('what a beach is furnished with', () => {
  it('reads showers and lifeguard towers, not the lifeguard base under the promenade', () => {
    expect(furnitureKindOf({ amenity: 'shower' })).toBe('shower')
    expect(furnitureKindOf({ emergency: 'lifeguard', lifeguard: 'tower' })).toBe('lifeguard')
    expect(furnitureKindOf({ emergency: 'lifeguard' })).toBe('lifeguard')
    expect(furnitureKindOf({ emergency: 'lifeguard', lifeguard: 'base' })).toBeUndefined()
  })
  it('a sand court is sand, not lawn', () => {
    expect(classifyFeature({ leisure: 'pitch', sport: 'beachvolleyball', surface: 'sand' })).toBe('sand')
    expect(classifyFeature({ leisure: 'pitch', sport: 'beachvolleyball' })).toBe('sand')
    expect(classifyFeature({ leisure: 'pitch', sport: 'soccer', surface: 'grass' })).toBe('green')
  })
  it('the net crosses the court along its short side', () => {
    // A 16 m (east–west) by 8 m court.
    const k = Math.cos((41 * Math.PI) / 180)
    const dLon = 16 / (111_320 * k), dLat = 8 / 111_132
    const net = courtNet([
      { lat: 41, lon: 1 }, { lat: 41, lon: 1 + dLon }, { lat: 41 + dLat, lon: 1 + dLon }, { lat: 41 + dLat, lon: 1 },
    ])!
    // Long axis east–west → the net runs north–south.
    expect(Math.min(Math.abs(net.bearingDeg), Math.abs(net.bearingDeg - 180), Math.abs(net.bearingDeg - 360))).toBeLessThan(1)
  })
  it('a lifeguard tower turns its back on the promenade', () => {
    const H = { heightM: 0, minHeightM: 0, estimated: true }
    // A footway (the promenade) running east–west at y = 0, the tower 30 m south of it, on the sand.
    const promenade: OsmFeature = {
      id: 'w1', kind: 'road', ring: [{ lat: 0, lon: -0.001 }, { lat: 0, lon: 0.001 }], height: H, widthM: 6,
      style: { roofShape: 'flat', roofHeightM: 0, roadClass: 'pedestrian' },
    }
    const tower: OsmFeature = {
      id: 'n2', kind: 'furniture', point: { lat: -30 / 111_132, lon: 0 }, height: H,
      style: { roofShape: 'flat', roofHeightM: 0, furniture: 'lifeguard' },
    }
    const plan = planFurniture([promenade, tower], (p) => ({ x: p.lon * 111_320, y: p.lat * 111_132 }))
    const lg = plan.find((p) => p.slot === 'lifeguard')!
    // Facing south (−y), away from the promenade: yaw −90°.
    expect(((Math.round((lg.at.yaw * 180) / Math.PI) % 360) + 360) % 360).toBe(270)
  })
})

import { shoreTone } from './osm-scene'

describe('the shore of a beach', () => {
  const dry = [0.8, 0.72, 0.56]
  it('is wet and dark at the water, dry beyond the wrack line', () => {
    const atWater = shoreTone(dry, 0, 0, 0)
    const up = shoreTone(dry, 40, 0, 0)
    expect(atWater[0]).toBeLessThan(dry[0] * 0.7)
    expect(up).toEqual(dry)
  })
})
