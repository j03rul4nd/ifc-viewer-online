import { describe, it, expect } from 'vitest'
import {
  WGS84_RADIUS,
  WEB_MERCATOR_WORLD_M,
  MERCATOR_MAX_LAT,
  latLonToMercator,
  mercatorToLatLon,
  latLonToNormalized,
  normalizedToLatLon,
  groundResolution,
  cosLatScale,
  latLonToTile,
  latLonToTilePixel,
  compoundAngleToDegrees,
  degreesToCompoundAngle,
  rotationFromXAxis,
  rotationFromTrueNorth,
  normalizeDeg,
  formatCoord,
  composeGeoRootTransform,
  mapYawRad,
  metresToNormalized,
  eastDirection,
  northDirection,
  panPlacement,
  wrapLon,
} from './geo-math'

const BCN = { lat: 41.3851, lon: 2.1734 } // Barcelona — golden fixture anchor

describe('geo-math · projections', () => {
  it('projects the equator/prime-meridian origin to mercator (0,0)', () => {
    const { mx, my } = latLonToMercator(0, 0)
    expect(mx).toBeCloseTo(0, 6)
    expect(my).toBeCloseTo(0, 6)
  })

  it('projects lon 180 to half the world width', () => {
    const { mx } = latLonToMercator(0, 180)
    expect(mx).toBeCloseTo(WEB_MERCATOR_WORLD_M / 2, 3)
  })

  it('round-trips 1000 random points (merc ↔ latlon)', () => {
    for (let i = 0; i < 1000; i++) {
      const lat = (Math.random() * 2 - 1) * 84
      const lon = (Math.random() * 2 - 1) * 179.9
      const { mx, my } = latLonToMercator(lat, lon)
      const back = mercatorToLatLon(mx, my)
      expect(back.lat).toBeCloseTo(lat, 8)
      expect(back.lon).toBeCloseTo(lon, 8)
    }
  })

  it('handles southern/western hemispheres with correct signs', () => {
    const { mx, my } = latLonToMercator(-33.4489, -70.6693) // Santiago de Chile
    expect(mx).toBeLessThan(0)
    expect(my).toBeLessThan(0)
  })

  it('clamps latitude beyond the mercator limit instead of producing Infinity', () => {
    const { my } = latLonToMercator(90, 0)
    const { my: myMax } = latLonToMercator(MERCATOR_MAX_LAT, 0)
    expect(my).toBeCloseTo(myMax, 3)
    expect(Number.isFinite(my)).toBe(true)
  })

  it('normalized coords span ±0.5 and round-trip', () => {
    const edge = latLonToNormalized(0, 180)
    expect(edge.nx).toBeCloseTo(0.5, 9)
    const top = latLonToNormalized(MERCATOR_MAX_LAT, 0)
    expect(top.ny).toBeCloseTo(0.5, 6)
    const back = normalizedToLatLon(...(Object.values(latLonToNormalized(BCN.lat, BCN.lon)) as [number, number]))
    expect(back.lat).toBeCloseTo(BCN.lat, 8)
    expect(back.lon).toBeCloseTo(BCN.lon, 8)
  })

  it('normalized Y grows northward (matches GeneratedSurfacePlugin)', () => {
    expect(latLonToNormalized(45, 0).ny).toBeGreaterThan(0)
    expect(latLonToNormalized(-45, 0).ny).toBeLessThan(0)
  })

  it('ground resolution matches the published value at equator z0', () => {
    // 2πR / 256 ≈ 156 543 m/px
    expect(groundResolution(0, 0)).toBeCloseTo(156543.03, 1)
    expect(groundResolution(60, 0)).toBeCloseTo(156543.03 * 0.5, 0)
  })

  it('cosLatScale is cos(lat)', () => {
    expect(cosLatScale(0)).toBeCloseTo(1, 9)
    expect(cosLatScale(60)).toBeCloseTo(0.5, 9)
  })
})

describe('geo-math · slippy tiles', () => {
  it('locates Barcelona in the correct z10 tile (verified against tile calculators)', () => {
    // lon 2.1734 → x = (2.1734+180)/360·1024 = 518.17 → 518
    // lat 41.3851 → y = (1 − ln(tan φ + sec φ)/π)/2 · 1024 = 382.5 → 382
    expect(latLonToTile(BCN.lat, BCN.lon, 10)).toEqual({ x: 518, y: 382 })
  })

  it('tile (0,0) at z0 covers the whole world', () => {
    expect(latLonToTile(80, -170, 0)).toEqual({ x: 0, y: 0 })
    expect(latLonToTile(-80, 170, 0)).toEqual({ x: 0, y: 0 })
  })

  it('y grows southward', () => {
    const north = latLonToTile(60, 0, 5)
    const south = latLonToTile(-60, 0, 5)
    expect(south.y).toBeGreaterThan(north.y)
  })

  it('tile pixel stays within the tile dimension', () => {
    const p = latLonToTilePixel(BCN.lat, BCN.lon, 13, 256)
    expect(p.px).toBeGreaterThanOrEqual(0)
    expect(p.px).toBeLessThan(256)
    expect(p.py).toBeGreaterThanOrEqual(0)
    expect(p.py).toBeLessThan(256)
    // tile indices must match latLonToTile
    expect({ x: p.x, y: p.y }).toEqual(latLonToTile(BCN.lat, BCN.lon, 13))
  })
})

describe('geo-math · IFC angles', () => {
  it('converts positive compound angles', () => {
    // 41° 23' 6.36" ≈ 41.38510
    expect(compoundAngleToDegrees([41, 23, 6, 360000])).toBeCloseTo(41.3851, 4)
  })

  it('applies the sign of the first non-zero component to all parts', () => {
    expect(compoundAngleToDegrees([-41, -23, -6])).toBeCloseTo(-(41 + 23 / 60 + 6 / 3600), 9)
    // Sloppy file: only the first component carries the sign
    expect(compoundAngleToDegrees([-41, 23, 6])).toBeCloseTo(-(41 + 23 / 60 + 6 / 3600), 9)
  })

  it('handles a sign carried by minutes when degrees are zero', () => {
    expect(compoundAngleToDegrees([0, -30, 0])).toBeCloseTo(-0.5, 9)
  })

  it('rejects empty and non-finite input', () => {
    expect(compoundAngleToDegrees([])).toBeNull()
    expect(compoundAngleToDegrees(null)).toBeNull()
    expect(compoundAngleToDegrees([NaN, 0])).toBeNull()
  })

  it('derives rotation from the MapConversion X axis (normalizing non-unit vectors)', () => {
    expect(rotationFromXAxis(1, 0)).toBeCloseTo(0, 9)
    expect(rotationFromXAxis(0, 1)).toBeCloseTo(Math.PI / 2, 9)
    // non-unit vector — atan2 is scale-invariant
    expect(rotationFromXAxis(86.6, 50)).toBeCloseTo(Math.PI / 6, 3)
    expect(rotationFromXAxis(0, 0)).toBeNull()
  })

  it('derives rotation from TrueNorth ratios (0 when TrueNorth = +Y)', () => {
    expect(rotationFromTrueNorth(0, 1)).toBeCloseTo(0, 9)
    expect(rotationFromTrueNorth(1, 0)).toBeCloseTo(Math.PI / 2, 9)
    expect(rotationFromTrueNorth(0, 0)).toBeNull()
  })

  it('normalizes degrees into [0, 360)', () => {
    expect(normalizeDeg(370)).toBeCloseTo(10)
    expect(normalizeDeg(-10)).toBeCloseTo(350)
    expect(normalizeDeg(0)).toBe(0)
  })

  it('formats coordinates with a fixed dot separator', () => {
    expect(formatCoord(41.38512345)).toBe('41.38512')
    expect(formatCoord(-3.5, 2)).toBe('-3.50')
  })

  it('wraps longitude into [−180, 180)', () => {
    expect(wrapLon(190)).toBeCloseTo(-170)
    expect(wrapLon(-190)).toBeCloseTo(170)
    expect(wrapLon(2.17)).toBeCloseTo(2.17)
  })
})

describe('geo-math · metresToNormalized', () => {
  // The round trip is the only thing that matters, and it is the thing that
  // fails silently: get the cosine backwards and every prop still renders, just
  // at cos²(lat) of its real size. Checking it against geoRoot's own scale is
  // what makes a flipped sign a red test instead of a shrug at the screen.
  it('a metre survives the trip out to the scene and back', () => {
    for (const lat of [0, 41.3851, 48.8566, 60, 69.65]) {
      const placement = { lat, lon: 2.1734, rotationDeg: 0, heightOffsetM: 0 }
      const { scale } = composeGeoRootTransform({
        placement, anchorScene: { x: 0, z: 0 }, modelMinY: 0,
      })
      // 10 m expressed in normalized units, then scaled by geoRoot, is 10 m.
      expect(10 * metresToNormalized(lat) * scale).toBeCloseTo(10, 6)
    }
  })

  it('grows with latitude — a normalized unit covers less ground up north', () => {
    expect(metresToNormalized(60)).toBeGreaterThan(metresToNormalized(0))
  })
})

describe('geo-math · composeGeoRootTransform (golden fixture)', () => {
  const placement = { lat: BCN.lat, lon: BCN.lon, rotationDeg: 0, heightOffsetM: 0 }

  it('scale = world width × cos(lat)', () => {
    const t = composeGeoRootTransform({ placement, anchorScene: { x: 0, z: 0 }, modelMinY: 0 })
    expect(t.scale).toBeCloseTo(WEB_MERCATOR_WORLD_M * Math.cos(BCN.lat * Math.PI / 180), 3)
    expect(t.tiltRad).toBeCloseTo(-Math.PI / 2, 9)
  })

  it('anchors the geographic point at the requested scene position (yaw 0)', () => {
    const t = composeGeoRootTransform({ placement, anchorScene: { x: 10, z: -5 }, modelMinY: 2 })
    // Apply the TRS to the anchor's normalized coords and expect (10, 2, −5).
    const { nx, ny } = latLonToNormalized(BCN.lat, BCN.lon)
    // Rx(−π/2): (nx, ny, 0) → (nx, 0, −ny); scale; yaw 0; + position
    const wx = t.position.x + t.scale * nx
    const wy = t.position.y + 0
    const wz = t.position.z - t.scale * ny
    expect(wx).toBeCloseTo(10, 6)
    expect(wy).toBeCloseTo(2, 6)
    expect(wz).toBeCloseTo(-5, 6)
  })

  it('keeps the anchor fixed under yaw (rotation about the anchor, not the origin)', () => {
    const yawed = composeGeoRootTransform({
      placement: { ...placement, rotationDeg: 30 },
      anchorScene: { x: 10, z: -5 },
      modelMinY: 0,
    })
    const { nx, ny } = latLonToNormalized(BCN.lat, BCN.lon)
    // Full transform: position + Ry(ψ)·S·Rx(−π/2)·(nx,ny,0)
    const ax = yawed.scale * nx
    const az = -yawed.scale * ny
    const cos = Math.cos(yawed.yawRad)
    const sin = Math.sin(yawed.yawRad)
    const wx = yawed.position.x + (ax * cos + az * sin)
    const wz = yawed.position.z + (-ax * sin + az * cos)
    expect(wx).toBeCloseTo(10, 5)
    expect(wz).toBeCloseTo(-5, 5)
  })

  it('height offset lowers the map plane (model appears higher)', () => {
    const t = composeGeoRootTransform({
      placement: { ...placement, heightOffsetM: 3 },
      anchorScene: { x: 0, z: 0 },
      modelMinY: 1,
    })
    expect(t.position.y).toBeCloseTo(-2, 9)
  })

  it('a point 1000 m east of the anchor lands 1000 scene-units along +X (true metres)', () => {
    const t = composeGeoRootTransform({ placement, anchorScene: { x: 0, z: 0 }, modelMinY: 0 })
    // Move east by Δlon such that true ground distance = 1000 m at this latitude.
    const dLonDeg = (1000 / (WGS84_RADIUS * Math.cos(BCN.lat * Math.PI / 180))) * 180 / Math.PI
    const p = latLonToNormalized(BCN.lat, BCN.lon + dLonDeg)
    const wx = t.position.x + t.scale * p.nx
    expect(wx).toBeCloseTo(1000, 0) // ±0.5 m — spherical vs ellipsoid tolerance
  })
})

describe('geo-math · directions & panning', () => {
  it('east/north directions at yaw 0 are +X and −Z', () => {
    expect(eastDirection(0)).toEqual({ x: 1, z: -0 })
    expect(northDirection(0).z).toBeCloseTo(-1, 9)
  })

  it('directions rotate with yaw and stay orthonormal', () => {
    const yaw = Math.PI / 6
    const e = eastDirection(yaw)
    const n = northDirection(yaw)
    expect(e.x * n.x + e.z * n.z).toBeCloseTo(0, 9)
    expect(Math.hypot(e.x, e.z)).toBeCloseTo(1, 9)
  })

  it('map-grab pan moves the geographic position opposite to the drag (yaw 0)', () => {
    const p = { lat: BCN.lat, lon: BCN.lon, rotationDeg: 0 }
    // Drag the ground 1000 m toward +X (east): grabbed point follows pointer,
    // so the model now sits 1000 m further WEST geographically.
    const out = panPlacement(p, 1000, 0)
    expect(out.lon).toBeLessThan(p.lon)
    // And dragging north (−Z) moves the model geographically south.
    const out2 = panPlacement(p, 0, -1000)
    expect(out2.lat).toBeLessThan(p.lat)
  })

  it('pan distance is metric-accurate at the anchor', () => {
    const p = { lat: 0, lon: 0, rotationDeg: 0 }
    const out = panPlacement(p, -1000, 0) // drag west → model moves east
    const merc = latLonToMercator(out.lat, out.lon)
    expect(merc.mx).toBeCloseTo(1000, 0)
  })

  it('pan respects yaw (a drag along the map east axis changes only longitude)', () => {
    const rotationDeg = 90
    const p = { lat: 0, lon: 0, rotationDeg }
    // Take the east axis at the yaw the basemap is ACTUALLY drawn with. Writing
    // the axis out by hand here would just re-assert whichever sign the code
    // happens to use, which is how the mirrored basemap went unnoticed.
    const e = eastDirection(mapYawRad(rotationDeg))
    const out = panPlacement(p, e.x * 1000, e.z * 1000)
    expect(Math.abs(out.lat)).toBeLessThan(1e-9)
    expect(out.lon).toBeLessThan(0) // map-grab: drag the ground east → site goes west
  })
})

describe('geo-math · the basemap yaw agrees with grid north', () => {
  // The regression that hid for months: composeGeoRootTransform yawed the map by
  // +rotationDeg, mirroring it in X for any site with a real MapConversion. The
  // suite only ever checked that the anchor holds still under yaw, which is true
  // whichever way the map faces.
  //
  // So this derives grid north from the MapConversion axes directly — no call to
  // mapYawRad, no reuse of the formula under test — and demands the basemap point
  // the same way.
  it.each([0, 30, -30, 90, 145.7])('holds at a %s° map rotation', (rotationDeg) => {
    const g = (rotationDeg * Math.PI) / 180
    // The project +X axis expressed in the grid, exactly as IfcMapConversion
    // stores it. Confirm the repo reads γ back out of it before relying on that.
    const xAbs = Math.cos(g)
    const xOrd = Math.sin(g)
    expect(rotationFromXAxis(xAbs, xOrd)).toBeCloseTo(g, 9)

    // Solve R(+γ)·p = (0, 1) for p: grid north as a project-space direction.
    // R(+γ)⁻¹ = Rᵀ for a rotation, so p = (xOrd, xAbs).
    const projectNorth = { x: xOrd, y: xAbs }
    // project → scene is x=x, y=z, z=−y (the normative convention in this file).
    const gridNorthScene = { x: projectNorth.x, z: -projectNorth.y }

    const t = composeGeoRootTransform({
      placement: { lat: BCN.lat, lon: BCN.lon, rotationDeg, heightOffsetM: 0 },
      anchorScene: { x: 0, z: 0 },
      modelMinY: 0,
    })
    const mapNorth = northDirection(t.yawRad)

    expect(mapNorth.x).toBeCloseTo(gridNorthScene.x, 9)
    expect(mapNorth.z).toBeCloseTo(gridNorthScene.z, 9)
  })

  it('still leaves the anchor exactly on the model, whatever the rotation', () => {
    // The property the old tests did check. Keep it: the fix must move the map's
    // facing without letting the building drift off its own coordinates.
    for (const rotationDeg of [0, 30, -77.25]) {
      const t = composeGeoRootTransform({
        placement: { lat: BCN.lat, lon: BCN.lon, rotationDeg, heightOffsetM: 0 },
        anchorScene: { x: 12, z: -8 },
        modelMinY: 3,
      })
      const { nx, ny } = latLonToNormalized(BCN.lat, BCN.lon)
      // Apply the composed TRS to the anchor in map-local coordinates.
      const ax = t.scale * nx
      const az = -t.scale * ny
      const c = Math.cos(t.yawRad)
      const s = Math.sin(t.yawRad)
      expect(t.position.x + ax * c + az * s).toBeCloseTo(12, 6)
      expect(t.position.z + (-ax * s + az * c)).toBeCloseTo(-8, 6)
      expect(t.position.y).toBeCloseTo(3, 9)
    }
  })
})

describe('geo-math · degreesToCompoundAngle (writing georeferencing back)', () => {
  it('round-trips through compoundAngleToDegrees at sub-millimetre precision', () => {
    for (const deg of [0, 41.3851, -41.3851, 46.0207, 7.749, -3.7038, 89.999999, -0.000001]) {
      const parts = degreesToCompoundAngle(deg)
      expect(parts).not.toBeNull()
      expect(compoundAngleToDegrees(parts!)).toBeCloseTo(deg, 9)
    }
  })

  it('produces the classic worked example', () => {
    // 41.3851° = 41° 23' 6.36"
    const [d, m, s, u] = degreesToCompoundAngle(41.3851)!
    expect(d).toBe(41)
    expect(m).toBe(23)
    expect(s).toBe(6)
    expect(u).toBeCloseTo(360000, -1)
  })

  it('signs EVERY non-zero component, as the spec requires', () => {
    const parts = degreesToCompoundAngle(-41.3851)!
    for (const v of parts) expect(v).toBeLessThanOrEqual(0)
    expect(parts[0]).toBe(-41)
    expect(parts[1]).toBe(-23)
  })

  it('keeps zero components at zero rather than negative zero noise', () => {
    const parts = degreesToCompoundAngle(-41)!
    expect(parts[0]).toBe(-41)
    expect(Math.abs(parts[1])).toBe(0)
    expect(Math.abs(parts[2])).toBe(0)
  })

  it('never emits an out-of-range component (carry is propagated)', () => {
    // Values engineered to round up through every boundary.
    for (const deg of [1 - 1e-12, 0.9999999999, 12.999999999999, 59.99999999999 / 60]) {
      const [, m, s, u] = degreesToCompoundAngle(deg)!
      expect(Math.abs(m)).toBeLessThan(60)
      expect(Math.abs(s)).toBeLessThan(60)
      expect(Math.abs(u)).toBeLessThan(1e6)
    }
  })

  it('returns integers — IFC compound angles are integer-valued', () => {
    for (const deg of [41.3851, -7.749, 46.0207]) {
      for (const v of degreesToCompoundAngle(deg)!) expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('handles exact zero', () => {
    expect(degreesToCompoundAngle(0)).toEqual([0, 0, 0, 0])
  })

  it('rejects non-finite input instead of writing garbage into the file', () => {
    expect(degreesToCompoundAngle(NaN)).toBeNull()
    expect(degreesToCompoundAngle(Infinity)).toBeNull()
    expect(degreesToCompoundAngle('41' as unknown as number)).toBeNull()
  })
})
