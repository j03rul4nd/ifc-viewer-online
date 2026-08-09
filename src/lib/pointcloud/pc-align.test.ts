// ─── pc-align tests ───────────────────────────────────────────────────────────
// The alignment ladder is the part of this feature that is silently wrong when
// it is wrong: a cloud lands somewhere plausible-looking and nobody notices
// until a measurement disagrees. So these tests check the actual geometry —
// where a known survey point ENDS UP in scene coordinates — rather than which
// branch was taken.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  alignCloud, effectiveTransform, guessUnitScale, enuOffset, unresolvedCloudCrs,
  cloudFileKey, saveOffset, loadOffset, clearOffset, saveCloudProj4, loadCloudProj4,
} from './pc-align'
import { registerCustomProj4, clearCustomProj4 } from '../geo/crs'
import { clampOffset, type SourceFrame, type PointCloudAlignment, type Vec3 } from './pc-types'
import type { GeorefExtraction, GeoPlacement } from '../geo/geo-types'

const DEG = Math.PI / 180

// ── Harness ────────────────────────────────────────────────────────────────────

/**
 * Apply an alignment to a SOURCE-space point exactly the way the renderer does:
 *   scene = position + Ry(yaw) · Rx(tilt) · (scale · (p − frame.origin))
 * Chunk origins cancel out — a chunk sits at (chunkOrigin − frameOrigin) and its
 * vertices at (p − chunkOrigin), so the sum is always (p − frameOrigin).
 */
function toScene(alignment: PointCloudAlignment, frame: SourceFrame, p: Vec3): Vec3 {
  const t = effectiveTransform(alignment)
  let x = (p.x - frame.origin.x) * t.scale
  let y = (p.y - frame.origin.y) * t.scale
  let z = (p.z - frame.origin.z) * t.scale

  if (t.tiltRad !== 0) {
    // Rx(−π/2): (x, y, z) → (x, z, −y)
    const ny = z, nz = -y
    y = ny; z = nz
  }
  const cos = Math.cos(t.yawRad), sin = Math.sin(t.yawRad)
  const rx = x * cos + z * sin
  const rz = -x * sin + z * cos

  return { x: rx + t.position.x, y: y + t.position.y, z: rz + t.position.z }
}

/** The IFC's own forward MapConversion: project plan coords → grid. */
function projectToGrid(
  g: { eastings: number; northings: number; rotationDeg: number; scale: number },
  xP: number, yP: number,
): { e: number; n: number } {
  const gamma = g.rotationDeg * DEG
  return {
    e: g.eastings + g.scale * (xP * Math.cos(gamma) - yP * Math.sin(gamma)),
    n: g.northings + g.scale * (xP * Math.sin(gamma) + yP * Math.cos(gamma)),
  }
}

function georef(patch: Partial<GeorefExtraction> = {}): GeorefExtraction {
  return {
    status: 'found', rung: 1, epsgCode: 'EPSG:25832',
    lat: null, lon: null, heightM: 0, rotationDeg: 0,
    eastings: 0, northings: 0, scale: 1,
    raw: {}, reasons: [], largeWcsOffset: false, siteExpressId: null,
    ...patch,
  }
}

function frameOf(min: Vec3, max: Vec3, patch: Partial<SourceFrame> = {}): SourceFrame {
  return {
    unitScale: 1, unitSource: 'assumed', epsgCode: 'EPSG:25832', upAxis: 'z', upAxisSource: 'declared',
    min, max,
    origin: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    ...patch,
  }
}

const MODEL_BOUNDS = {
  center: { x: 0, y: 5, z: 0 },
  size: { x: 40, y: 10, z: 30 },
}

// ── Rung 1: map conversion ─────────────────────────────────────────────────────

describe('alignCloud — georeferenced (map conversion)', () => {
  it('lands a survey point on the project coordinates the MapConversion defines', () => {
    const g = georef({ eastings: 500_000, northings: 4_500_000, rotationDeg: 0, scale: 1, heightM: 0 })
    // Project point (10, 20, 5) — where the IFC says this survey point belongs.
    const grid = projectToGrid({ eastings: 500_000, northings: 4_500_000, rotationDeg: 0, scale: 1 }, 10, 20)
    const point = { x: grid.e, y: grid.n, z: 5 }
    const frame = frameOf({ x: grid.e - 50, y: grid.n - 50, z: 0 }, { x: grid.e + 50, y: grid.n + 50, z: 10 })

    const alignment = alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.rung).toBe('map-conversion')
    expect(alignment.confidence).toBe('exact')

    // Project (10, 20, 5) → scene (x=10, y=5, z=−20).
    const scene = toScene(alignment, frame, point)
    expect(scene.x).toBeCloseTo(10, 6)
    expect(scene.y).toBeCloseTo(5, 6)
    expect(scene.z).toBeCloseTo(-20, 6)
  })

  it('is exact at the far end of a kilometre-scale offset (float64 origin shift)', () => {
    const g = georef({ eastings: 432_100.5, northings: 5_678_900.25, heightM: 12.5 })
    const grid = projectToGrid({ eastings: 432_100.5, northings: 5_678_900.25, rotationDeg: 0, scale: 1 }, 1200, -800)
    const point = { x: grid.e, y: grid.n, z: 112.5 }
    const frame = frameOf({ x: grid.e - 2000, y: grid.n - 2000, z: 0 }, { x: grid.e, y: grid.n, z: 200 })

    const scene = toScene(alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS }), frame, point)
    expect(scene.x).toBeCloseTo(1200, 4)
    expect(scene.y).toBeCloseTo(100, 4)   // 112.5 − 12.5 reference elevation
    expect(scene.z).toBeCloseTo(800, 4)
  })

  it('inverts a rotated MapConversion (grid north is not project north)', () => {
    const conv = { eastings: 500_000, northings: 4_500_000, rotationDeg: 30, scale: 1 }
    const g = georef(conv)
    const grid = projectToGrid(conv, 25, 0)
    const point = { x: grid.e, y: grid.n, z: 0 }
    const frame = frameOf({ x: grid.e - 100, y: grid.n - 100, z: 0 }, { x: grid.e + 100, y: grid.n + 100, z: 5 })

    const scene = toScene(alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS }), frame, point)
    expect(scene.x).toBeCloseTo(25, 5)
    expect(scene.z).toBeCloseTo(0, 5)
  })

  it('inverts a MapConversion scale factor', () => {
    const conv = { eastings: 0, northings: 0, rotationDeg: 0, scale: 2 }
    const g = georef({ ...conv, epsgCode: 'EPSG:25832' })
    const point = { x: 60, y: 40, z: 8 }  // grid = 2 × project
    const frame = frameOf({ x: 0, y: 0, z: 0 }, { x: 120, y: 80, z: 16 })

    const alignment = alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.scale).toBeCloseTo(0.5, 9)
    const scene = toScene(alignment, frame, point)
    expect(scene.x).toBeCloseTo(30, 6)
    expect(scene.y).toBeCloseTo(4, 6)
    expect(scene.z).toBeCloseTo(-20, 6)
  })

  it('converts a cloud recorded in US survey feet', () => {
    const g = georef({ eastings: 0, northings: 0, heightM: 0 })
    const ftToM = 1200 / 3937
    const frame = frameOf(
      { x: 0, y: 0, z: 0 }, { x: 328, y: 328, z: 32 },
      { unitScale: ftToM, unitSource: 'declared' },
    )
    // 100 ft east of the origin → 30.48 m in project coordinates.
    const scene = toScene(
      alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS }),
      frame, { x: 100, y: 0, z: 0 },
    )
    expect(scene.x).toBeCloseTo(100 * ftToM, 6)
  })

  it('drops to "high" confidence and says so when the IFC names no CRS', () => {
    const g = georef({ epsgCode: null, eastings: 500_000, northings: 4_500_000 })
    const frame = frameOf({ x: 499_900, y: 4_499_900, z: 0 }, { x: 500_100, y: 4_500_100, z: 10 })
    const alignment = alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.rung).toBe('shared-crs')
    expect(alignment.confidence).toBe('high')
    expect(alignment.reasons).toContain('align.reason.assumedSameCrs')
  })

  it('flags a missing reference elevation instead of silently assuming zero', () => {
    const g = georef({ heightM: null, eastings: 0, northings: 0 })
    const frame = frameOf({ x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 4 })
    const alignment = alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.reasons).toContain('align.reason.noElevationDatum')
    expect(alignment.confidence).not.toBe('exact')
  })

  it('reprojects a cloud delivered in a different grid to the model’s', () => {
    // Same physical place, two UTM zones. 25832 = zone 32N, 25833 = zone 33N.
    const g = georef({ epsgCode: 'EPSG:25833', eastings: 300_000, northings: 5_600_000 })
    const frame = frameOf(
      { x: 690_000, y: 5_600_000, z: 0 }, { x: 690_200, y: 5_600_200, z: 20 },
      { epsgCode: 'EPSG:25832' },
    )
    const alignment = alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.rung).toBe('shared-crs')
    expect(alignment.reasons).toContain('align.reason.reprojected')
    // The convergence between two UTM zones is real and non-zero: the aligner
    // must have rotated, not just translated.
    expect(Math.abs(alignment.yawRad)).toBeGreaterThan(1e-4)
  })
})

// ── Rung 3: geographic anchor ──────────────────────────────────────────────────

describe('alignCloud — geographic anchor', () => {
  const placement: GeoPlacement = {
    lat: 41.3874, lon: 2.1686, rotationDeg: 0, heightOffsetM: 0,
    source: 'ifc', confidence: 'approximate',
  }

  it('uses the site lat/lon when the model has no map conversion, and says it is approximate', () => {
    const g = georef({ eastings: null, northings: null, lat: placement.lat, lon: placement.lon, rung: 3 })
    const frame = frameOf({ x: 430_000, y: 4_581_000, z: 0 }, { x: 430_100, y: 4_581_100, z: 15 })
    const alignment = alignCloud({ frame, georef: g, placement, modelBounds: MODEL_BOUNDS })

    expect(alignment.rung).toBe('geographic')
    expect(alignment.confidence).toBe('approximate')
    expect(alignment.reasons).toContain('align.reason.geographicAnchor')
  })

  it('places the scan floor on the model floor when no elevation datum is shared', () => {
    const g = georef({ eastings: null, northings: null, lat: placement.lat, lon: placement.lon, rung: 3 })
    const frame = frameOf({ x: 430_000, y: 4_581_000, z: 40 }, { x: 430_100, y: 4_581_100, z: 60 })
    const alignment = alignCloud({ frame, georef: g, placement, modelBounds: MODEL_BOUNDS })

    const modelMinY = MODEL_BOUNDS.center.y - MODEL_BOUNDS.size.y / 2
    // The lowest point of the cloud must sit on the model's lowest point.
    const floor = toScene(alignment, frame, { x: frame.origin.x, y: frame.origin.y, z: frame.min.z })
    expect(floor.y).toBeCloseTo(modelMinY, 6)
  })
})

// ── Rung 4/5: no georeferencing ────────────────────────────────────────────────

describe('alignCloud — local and manual', () => {
  it('treats an overlapping, un-georeferenced cloud as the same local frame', () => {
    const frame = frameOf({ x: -20, y: -15, z: 0 }, { x: 20, y: 15, z: 10 }, { epsgCode: null })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })

    expect(alignment.rung).toBe('local')
    expect(alignment.yawRad).toBe(0)
    expect(alignment.scale).toBe(1)
    // Identity: source (x, y, z) → scene (x, z, −y).
    const scene = toScene(alignment, frame, { x: 12, y: 7, z: 3 })
    expect(scene.x).toBeCloseTo(12, 9)
    expect(scene.y).toBeCloseTo(3, 9)
    expect(scene.z).toBeCloseTo(-7, 9)
  })

  it('refuses the local rung when the cloud is nowhere near the model', () => {
    const frame = frameOf({ x: 9_000, y: 9_000, z: 0 }, { x: 9_040, y: 9_030, z: 10 }, { epsgCode: null })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.rung).toBe('manual')
    expect(alignment.confidence).toBe('manual')
    expect(alignment.reasons).toContain('align.reason.noCommonReference')
  })

  it('centres a manual cloud on the model plan and rests it on the model floor', () => {
    const frame = frameOf({ x: 9_000, y: 9_000, z: 0 }, { x: 9_040, y: 9_030, z: 10 }, { epsgCode: null })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })

    const centre = toScene(alignment, frame, frame.origin)
    expect(centre.x).toBeCloseTo(MODEL_BOUNDS.center.x, 6)
    expect(centre.z).toBeCloseTo(MODEL_BOUNDS.center.z, 6)
    const floor = toScene(alignment, frame, { ...frame.origin, z: frame.min.z })
    expect(floor.y).toBeCloseTo(MODEL_BOUNDS.center.y - MODEL_BOUNDS.size.y / 2, 6)
  })

  it('falls back to a self-contained placement with no model at all', () => {
    const frame = frameOf({ x: -5, y: -5, z: 0 }, { x: 5, y: 5, z: 4 }, { epsgCode: null })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: null })
    expect(alignment.rung).toBe('manual')
    const floor = toScene(alignment, frame, { ...frame.origin, z: frame.min.z })
    expect(floor.y).toBeCloseTo(0, 6)
  })
})

// ── Units ──────────────────────────────────────────────────────────────────────

describe('guessUnitScale', () => {
  const model = { center: { x: 0, y: 5, z: 0 }, size: { x: 30, y: 10, z: 20 } }

  it('detects a millimetre cloud from the extent ratio', () => {
    const frame = frameOf({ x: 0, y: 0, z: 0 }, { x: 30_000, y: 20_000, z: 10_000 }, { epsgCode: null })
    expect(guessUnitScale(frame, model)).toBe(0.001)
  })

  it('leaves a declared unit alone even when the ratio looks odd', () => {
    const frame = frameOf(
      { x: 0, y: 0, z: 0 }, { x: 30_000, y: 20_000, z: 10_000 },
      { epsgCode: null, unitScale: 1, unitSource: 'declared' },
    )
    expect(guessUnitScale(frame, model)).toBe(1)
  })

  it('does not guess when the ratio is ambiguous', () => {
    const frame = frameOf({ x: 0, y: 0, z: 0 }, { x: 200, y: 150, z: 40 }, { epsgCode: null })
    expect(guessUnitScale(frame, model)).toBe(1)
  })

  it('scales a millimetre cloud into metres in the resulting alignment', () => {
    const frame = frameOf({ x: -15_000, y: -10_000, z: 0 }, { x: 15_000, y: 10_000, z: 10_000 }, { epsgCode: null })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: model })
    expect(alignment.scale).toBe(0.001)
    expect(alignment.reasons).toContain('align.reason.unitMillimetres')
  })
})

// ── Manual offset ──────────────────────────────────────────────────────────────

describe('manual offsets', () => {
  it('applies on top of the derived transform without altering it', () => {
    const frame = frameOf({ x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 5 }, { epsgCode: null })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })
    const nudged: PointCloudAlignment = {
      ...alignment,
      offset: clampOffset({ x: 3, y: -1, z: 2, yawDeg: 90, pitchDeg: 0, rollDeg: 0, scaleMul: 2 }),
    }

    // The derived half is untouched — "reset" can always get back to it.
    expect(nudged.origin).toEqual(alignment.origin)
    expect(nudged.yawRad).toBe(alignment.yawRad)
    expect(nudged.scale).toBe(alignment.scale)

    const t = effectiveTransform(nudged)
    expect(t.position.x).toBeCloseTo(alignment.origin.x + 3, 9)
    expect(t.position.y).toBeCloseTo(alignment.origin.y - 1, 9)
    expect(t.position.z).toBeCloseTo(alignment.origin.z + 2, 9)
    expect(t.yawRad).toBeCloseTo(alignment.yawRad + Math.PI / 2, 9)
    expect(t.scale).toBeCloseTo(alignment.scale * 2, 9)
  })

  it('clamps nonsense offsets rather than propagating NaN into the scene graph', () => {
    const o = clampOffset({ x: NaN, scaleMul: 0, yawDeg: 720 })
    expect(o.x).toBe(0)
    expect(o.scaleMul).toBeGreaterThan(0)
    expect(Math.abs(o.yawDeg)).toBeLessThan(360)
  })

  it('a Y-up source is not tilted', () => {
    const frame = frameOf({ x: -10, y: 0, z: -10 }, { x: 10, y: 5, z: 10 }, { epsgCode: null, upAxis: 'y', upAxisSource: 'declared' })
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })
    expect(effectiveTransform(alignment).tiltRad).toBe(0)
  })
})

// ── Unresolvable CRS ───────────────────────────────────────────────────────────

describe('unresolved cloud CRS', () => {
  beforeEach(() => { clearCustomProj4() })

  it('flags a CRS the build has no definition for, as an actionable reason', () => {
    // EPSG:21781 (CH1903 / LV03, the legacy Swiss grid) is real and NOT in the
    // bundled registry — the aligner must say so rather than silently degrading.
    // This used to be EPSG:2903; that became resolvable when the US State Plane
    // table landed, which would have left these three tests asserting nothing.
    const frame = frameOf({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 10 }, { epsgCode: 'EPSG:21781' })
    expect(unresolvedCloudCrs(frame)).toBe(true)
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.reasons).toContain('align.reason.cloudCrsUnknown')
  })

  it('does NOT flag a file that simply carries no CRS — that is not actionable', () => {
    const frame = frameOf({ x: 0, y: 0, z: 0 }, { x: 30, y: 20, z: 8 }, { epsgCode: null })
    expect(unresolvedCloudCrs(frame)).toBe(false)
    const alignment = alignCloud({ frame, georef: null, placement: null, modelBounds: MODEL_BOUNDS })
    expect(alignment.reasons).not.toContain('align.reason.cloudCrsUnknown')
  })

  it('does not flag a code the registry does resolve', () => {
    expect(unresolvedCloudCrs(frameOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }))).toBe(false)
  })

  it('a registered proj4 definition unlocks the georeferenced rungs', () => {
    const frame = frameOf(
      { x: 499_900, y: 4_499_900, z: 0 }, { x: 500_100, y: 4_500_100, z: 10 },
      { epsgCode: 'EPSG:21781' },
    )
    const g = georef({ epsgCode: null, eastings: 500_000, northings: 4_500_000 })

    // Before: unresolvable, so the ladder cannot use the grid coordinates.
    expect(alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS }).rung)
      .not.toBe('shared-crs')

    // The user pastes a definition — the same registry map mode writes to.
    const reg = registerCustomProj4('EPSG:21781',
      '+proj=tmerc +lat_0=31 +lon_0=-106.25 +k=0.9999 +x_0=500000.0000000002 ' +
      '+y_0=0 +ellps=GRS80 +units=us-ft +no_defs')
    expect(reg.ok).toBe(true)

    const after = alignCloud({ frame, georef: g, placement: null, modelBounds: MODEL_BOUNDS })
    expect(after.rung).toBe('shared-crs')
    expect(after.reasons).not.toContain('align.reason.cloudCrsUnknown')
  })

  it('rejects a definition proj4 cannot parse, leaving the registry untouched', () => {
    expect(registerCustomProj4('EPSG:21781', 'not a projection at all').ok).toBe(false)
    const frame = frameOf({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 10 }, { epsgCode: 'EPSG:21781' })
    expect(unresolvedCloudCrs(frame)).toBe(true)
  })
})

// ── Placement persistence ──────────────────────────────────────────────────────

describe('offset persistence', () => {
  const file = { name: 'site-scan.las', size: 12_345, lastModified: 1_700_000_000_000 }

  beforeEach(() => { localStorage.clear() })

  it('keys a placement by the file, not the session', () => {
    const key = cloudFileKey(file)
    expect(key).toContain('site-scan.las')
    // A different revision of the same filename must not inherit the placement.
    expect(cloudFileKey({ ...file, lastModified: 1 })).not.toBe(key)
  })

  it('round-trips a manual placement', () => {
    const key = cloudFileKey(file)
    const offset = clampOffset({ x: 2.5, y: -1, z: 0.25, yawDeg: 12, pitchDeg: 0, rollDeg: 0, scaleMul: 1.02 })
    saveOffset(key, offset)
    expect(loadOffset(key)).toEqual(offset)
  })

  it('stores nothing for an identity placement, and forgets a reset one', () => {
    const key = cloudFileKey(file)
    saveOffset(key, clampOffset({ x: 4 }))
    expect(loadOffset(key)).not.toBeNull()
    saveOffset(key, clampOffset({}))          // the user pressed Reset
    expect(loadOffset(key)).toBeNull()
  })

  it('returns null for an unknown file and for corrupt storage', () => {
    expect(loadOffset('never-seen')).toBeNull()
    localStorage.setItem('ifc-pc-offset:v1:broken', '{not json')
    expect(loadOffset('broken')).toBeNull()
    localStorage.setItem('ifc-pc-offset:v1:oldversion', JSON.stringify({ v: 99, offset: { x: 1 } }))
    expect(loadOffset('oldversion')).toBeNull()
  })

  it('clamps a tampered stored placement rather than trusting it', () => {
    localStorage.setItem('ifc-pc-offset:v1:evil',
      JSON.stringify({ v: 1, offset: { x: 'NaN', scaleMul: 0 } }))
    const loaded = loadOffset('evil')!
    expect(loaded.x).toBe(0)
    expect(loaded.scaleMul).toBeGreaterThan(0)
  })

  it('round-trips a user-supplied proj4 definition per file', () => {
    const key = cloudFileKey(file)
    const def = '+proj=tmerc +lat_0=31 +lon_0=-106.25 +k=0.9999 +x_0=500000 +y_0=0 +ellps=GRS80 +units=us-ft +no_defs'
    saveCloudProj4(key, 'EPSG:21781', def)
    expect(loadCloudProj4(key)).toEqual({ code: 'EPSG:21781', def })
    expect(loadCloudProj4('another-file')).toBeNull()
  })

  it('ignores a corrupt stored proj4 entry', () => {
    localStorage.setItem('ifc-pc-proj4:v1:bad', '{"v":9,"code":"x"}')
    expect(loadCloudProj4('bad')).toBeNull()
  })

  it('clearOffset removes it', () => {
    const key = cloudFileKey(file)
    saveOffset(key, clampOffset({ x: 3 }))
    clearOffset(key)
    expect(loadOffset(key)).toBeNull()
  })
})

// ── ENU helper ─────────────────────────────────────────────────────────────────

describe('enuOffset', () => {
  it('is zero at the anchor and grows north/east correctly', () => {
    expect(enuOffset(41.4, 2.17, 41.4, 2.17)).toEqual({ east: 0, north: 0 })
    const north = enuOffset(41.4, 2.17, 41.4 + 0.001, 2.17)
    expect(north.north).toBeGreaterThan(100)
    expect(north.north).toBeLessThan(120)
    expect(north.east).toBeCloseTo(0, 9)
  })
})
