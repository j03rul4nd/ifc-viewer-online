import { describe, expect, it } from 'vitest'
import { genericFacadeTypology, STREET_BUILDING_MAX_M } from './facade-typologies'
import { buildBuildingsGeometry } from './building-mesh'
import { resolveFeatureStyle } from './osm-features'

describe('generic facade typologies', () => {
  it('gives street buildings and houses a typology, by region', () => {
    const med = genericFacadeTypology('apartments', 20, 'mediterranean')!
    const north = genericFacadeTypology('apartments', 20, 'northern-europe')!
    expect(med.balconyProbability).toBeGreaterThan(north.balconyProbability)
    expect(med.shutterTone).not.toEqual(north.shutterTone)
    expect(genericFacadeTypology('house', 7, 'generic')!.balconyProbability).toBe(0)
    expect(genericFacadeTypology(undefined, 15, 'east-asia')).not.toBeNull()
  })
  it('leaves towers, sheds, industry, temples and anything tall alone', () => {
    for (const u of ['tower', 'industrial', 'shed', 'temple', 'shrine'] as const) {
      expect(genericFacadeTypology(u, 12, 'generic')).toBeNull()
    }
    expect(genericFacadeTypology('apartments', STREET_BUILDING_MAX_M + 1, 'generic')).toBeNull()
  })
  it('switches the procedural facade on in the mesh only when asked', () => {
    const lat0 = 52.37; const lon0 = 4.89; const dLat = 1 / 111_320; const dLon = 1 / (111_320 * Math.cos((lat0 * Math.PI) / 180))
    const b = {
      id: 'x', ring: [[0, 0], [14, 0], [14, 12], [0, 12]].map(([x, y]) => ({ lat: lat0 + y * dLat, lon: lon0 + x * dLon })),
      height: { heightM: 18, minHeightM: 0, estimated: false, basis: 'height' as const },
      style: resolveFeatureStyle('building', { building: 'apartments' }),
    }
    const bays = (generic: boolean) => {
      const g = buildBuildingsGeometry([b], { anchorLat: lat0, anchorLon: lon0, detail: 'detailed', lit: true, localOrigin: true, genericFacades: generic })!.geometry
      const a = g.getAttribute('aFacB')
      if (!a) return 0
      let n = 0
      for (let i = 0; i < a.count; i++) if (a.getZ(i) > 0) n++
      return n
    }
    expect(bays(false)).toBe(0)
    expect(bays(true)).toBeGreaterThan(0)
  })
})
