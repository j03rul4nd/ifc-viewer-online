// Everything on the map in the same place: data layers on their basemap
// streets, IFC models turned to true north, satellites turned to their own
// frame. Each case is a misalignment that was measured before it was fixed.
import { describe, it, expect } from 'vitest'
import { placementFromExtraction } from './placement'
import { anchorFromPlacement, enuFrom, lonLatToScene, mapOffsetFrom } from './scene-anchor'
import { pivotForYaw, sceneOfLatLon, satelliteYaw } from './multi-placement'
import type { GeoPlacement, GeorefExtraction } from './geo-types'

const DEG = Math.PI / 180

function extraction(partial: Partial<GeorefExtraction>): GeorefExtraction {
  return {
    status: 'found', rung: 1, epsgCode: 'EPSG:25831',
    lat: null, lon: null, heightM: null, rotationDeg: 0,
    eastings: null, northings: null, scale: 1,
    raw: {}, reasons: [], largeWcsOffset: false, siteExpressId: null,
    ...partial,
  }
}

const place = (lat: number, lon: number, rotationDeg = 0): GeoPlacement => ({
  lat, lon, rotationDeg, heightOffsetM: 0, source: 'ifc', confidence: 'high',
})

describe('data layers land where the map draws them', () => {
  // Endolla, Passeig de Gràcia 5: the Barcelona demo's anchor.
  const anchorP = place(41.3893, 2.1680)
  const anchor = anchorFromPlacement(anchorP, { x: 12, z: -7 }, 0, 'endolla.ifc')
  const frame = { placement: anchorP, anchorScene: { x: 12, z: -7 }, groundY: 0 }

  it('a point 4 km away is where the map (and an IFC satellite) puts it, to the millimetre', () => {
    for (const [lat, lon] of [[41.4250, 2.1980], [41.3600, 2.1300], [41.3893, 2.2160]]) {
      const layer = lonLatToScene(anchor, lon, lat, null)
      const map = sceneOfLatLon(frame, lat, lon)
      expect(Math.hypot(layer.x - map.x, layer.z - map.z)).toBeLessThan(0.001)
    }
  })

  it('the old ellipsoidal tangent plane was metres off the basemap at that distance', () => {
    const t = mapOffsetFrom(41.3893, 2.1680, 41.4250, 2.1980)
    const e = enuFrom(41.3893, 2.1680, 41.4250, 2.1980)
    expect(Math.hypot(t.east - e.east, t.north - e.north)).toBeGreaterThan(5)
  })

  it('honours the map rotation the same way', () => {
    const turnedP = place(41.3893, 2.1680, 12)
    const turned = anchorFromPlacement(turnedP, { x: 0, z: 0 }, 0, 'x.ifc')
    const f = { placement: turnedP, anchorScene: { x: 0, z: 0 }, groundY: 0 }
    const layer = lonLatToScene(turned, 2.1750, 41.3950, null)
    const map = sceneOfLatLon(f, 41.3950, 2.1750)
    expect(Math.hypot(layer.x - map.x, layer.z - map.z)).toBeLessThan(0.001)
  })
})

describe('IFC rotation is turned from grid north to true north', () => {
  it('the Barcelona demo models (UTM 31N, 0.55° off the central meridian) stand square to true north', () => {
    // endolla-pg-gracia.ifc: authored with true-north axes; IfcMapConversion
    // carries the grid's convergence as its rotation.
    const rot = Math.atan2(-0.009583985474460852, 0.9999540725565477) / DEG
    expect(rot).toBeCloseTo(-0.549, 2)
    const p = placementFromExtraction(extraction({ eastings: 430563.759870437, northings: 4582209.675255347, rotationDeg: rot }), null)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(Math.abs(p.value.rotationDeg)).toBeLessThan(0.01)
  })

  it('a rotated model keeps its own rotation, plus the convergence (Helsinki, GK25)', () => {
    // helsinki-cathedral.ifc: turned 3° on purpose; ETRS-GK25 is centred on 25°E.
    const rot = Math.atan2(0.052335956242943835, 0.9986295347545738) / DEG
    const p = placementFromExtraction(extraction({ epsgCode: 'EPSG:3879', eastings: 25497345.098770097, northings: 6673056.229699483, rotationDeg: rot }), null)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    // 24.95°E at 60.17°N: convergence ≈ (24.95 − 25)·sin 60.17° ≈ −0.04°.
    expect(p.value.rotationDeg).toBeGreaterThan(rot)
    expect(p.value.rotationDeg - rot).toBeCloseTo(0.04, 1)
  })

  it('on the central meridian there is nothing to turn', () => {
    const p = placementFromExtraction(extraction({ epsgCode: 'EPSG:25832', eastings: 500000, northings: 5000000, rotationDeg: 30 }), null)
    expect(p.ok && p.value.rotationDeg).toBeCloseTo(30, 6)
  })
})

describe('satellites turn to their own frame, about their own centre', () => {
  it('turns by the difference of the two rotations, the short way round', () => {
    expect(satelliteYaw(place(60.17, 24.94, 0), place(60.17, 24.95, 3))).toBeCloseTo(3 * DEG, 9)
    expect(satelliteYaw(place(0, 0, 179), place(0, 0, -179))).toBeCloseTo(2 * DEG, 9)
  })

  it('the point it turns about stays put, wherever the pivot is', () => {
    const pivot = { x: 40, z: -25 }
    const about = { x: 700, z: 155 }   // Helsinki Cathedral, 700 m from the anchor
    const local = { x: about.x - pivot.x, z: about.z - pivot.z }   // the point in pivot space (yaw 0)
    const p = pivotForYaw(pivot, 0, 3 * DEG, about)
    const c = Math.cos(3 * DEG), s = Math.sin(3 * DEG)
    // World = pivot + R(θ)·local (about +Y: x' = x cos + z sin, z' = −x sin + z cos).
    const wx = p.x + local.x * c + local.z * s
    const wz = p.z - local.x * s + local.z * c
    expect(Math.hypot(wx - about.x, wz - about.z)).toBeLessThan(1e-9)
    // And back to zero from there.
    const back = pivotForYaw(p, 3 * DEG, 0, about)
    expect(back.x).toBeCloseTo(pivot.x, 9)
    expect(back.z).toBeCloseTo(pivot.z, 9)
  })
})
