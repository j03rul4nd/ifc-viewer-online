import { describe, it, expect } from 'vitest'
import { resolveDatum, withinDatum, isShifted, DATUM_JOIN_RADIUS_M, type Vec3 } from './coordination-datum'

// Scene axes: x = easting, y = up, z = −northing. The coordination is what the
// loader added: drawn = real + c. Civil 3D in UTM 31N around Castellbisbal.
const real = (e: number, n: number, h = 0): Vec3 => ({ x: e, y: h, z: -n })
const shiftFor = (r: Vec3): Vec3 => ({ x: -r.x, y: -r.y, z: -r.z })   // web-ifc: minus the first mesh
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const drawnAt = (r: Vec3, own: Vec3, offset: Vec3 = { x: 0, y: 0, z: 0 }) => add(add(r, own), offset)

describe('resolveDatum', () => {
  const roadFirstMesh = real(412706.8, 4593519.1, 149.3)
  const roadCentre    = real(412700, 4593510, 151)
  const road = shiftFor(roadFirstMesh)

  it('a model in local coordinates leaves everything alone', () => {
    const r = resolveDatum({ own: { x: 0, y: 0, z: 0 }, drawnCentre: { x: 3, y: 1, z: -4 }, datum: null })
    expect(r).toMatchObject({ role: 'local', datum: null, objectOffset: { x: 0, y: 0, z: 0 } })
  })

  it('the first shifted model sets the datum and is drawn as converted', () => {
    const r = resolveDatum({ own: road, drawnCentre: drawnAt(roadCentre, road), datum: null })
    expect(r.role).toBe('set')
    expect(r.datum).toEqual(road)
    expect(r.coordination).toEqual(road)
    expect(r.objectOffset).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('a second file of the same site lands exactly where its real coordinates say', () => {
    // Drainage: its first mesh is 63 m from the road's, so web-ifc shifts it differently.
    const drainFirstMesh = real(412650.2, 4593480.7, 147.9)
    const drainCentre    = real(412660, 4593490, 148)
    const drain = shiftFor(drainFirstMesh)
    const r = resolveDatum({ own: drain, drawnCentre: drawnAt(drainCentre, drain), datum: road })
    expect(r.role).toBe('joined')
    expect(r.coordination).toEqual(road)
    // Drawn = real + datum, the same rule as the road: both files agree.
    const drawn = drawnAt(drainCentre, drain, r.objectOffset)
    const expected = add(drainCentre, road)
    expect(drawn.x).toBeCloseTo(expected.x, 6)
    expect(drawn.y).toBeCloseTo(expected.y, 6)
    expect(drawn.z).toBeCloseTo(expected.z, 6)
    // And the offset is small: geometry stays near the origin.
    expect(Math.hypot(r.objectOffset.x, r.objectOffset.z)).toBeLessThan(100)
  })

  it('a far model on another site keeps its own shift instead of being drawn hundreds of km out', () => {
    const madrid = shiftFor(real(440000, 4474000, 650))
    const r = resolveDatum({ own: madrid, drawnCentre: { x: 5, y: 2, z: -5 }, datum: road })
    expect(r.role).toBe('separate')
    expect(r.coordination).toEqual(madrid)
    expect(r.objectOffset).toEqual({ x: 0, y: 0, z: 0 })
    expect(r.datum).toEqual(road)
  })

  it('a local-coordinates model stays put when a datum exists', () => {
    const r = resolveDatum({ own: { x: 0, y: 0, z: 0 }, drawnCentre: { x: 10, y: 0, z: -10 }, datum: road })
    expect(r.role).toBe('local')
    expect(r.objectOffset).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('an unshifted model whose real coordinates are on the datum site joins it', () => {
    // E.g. one file under the 100 km threshold the converter left alone.
    const datum = shiftFor(real(150000, 60000))
    const near = real(99990, 59990)
    const r = resolveDatum({ own: { x: 0, y: 0, z: 0 }, drawnCentre: near, datum })
    expect(r.role).toBe('joined')
    expect(r.objectOffset).toEqual(datum)
  })

  it('without bounds it decides from the shift alone', () => {
    const sibling = shiftFor(real(412720, 4593530, 150))
    expect(resolveDatum({ own: sibling, drawnCentre: null, datum: road }).role).toBe('joined')
  })
})

describe('withinDatum / isShifted', () => {
  it('measures in plan only, up to the join radius', () => {
    const datum = { x: -1_000_000, y: -2000, z: 0 }
    expect(withinDatum({ x: DATUM_JOIN_RADIUS_M - 1, y: 5000, z: 0 }, datum, datum)).toBe(true)
    expect(withinDatum({ x: DATUM_JOIN_RADIUS_M + 1, y: 0, z: 0 }, datum, datum)).toBe(false)
  })

  it('treats float noise as no shift', () => {
    expect(isShifted({ x: 1e-9, y: 0, z: -1e-9 })).toBe(false)
    expect(isShifted({ x: 0.01, y: 0, z: 0 })).toBe(true)
    expect(isShifted(null)).toBe(false)
  })
})
