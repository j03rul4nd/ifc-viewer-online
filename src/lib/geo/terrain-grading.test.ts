import { describe, expect, it } from 'vitest'
import {
  createStreetGrading, streetLevels, BANK_RUN, MAX_BANK_M, SHOULDER_PER_SPACING,
} from './terrain-grading'

/** A hillside rising 30 cm per metre toward +y: steep, like El Carmel. */
const SLOPE = 0.3
const hillside = (_x: number, y: number): number => 100 + y * SLOPE
const SPACING = 8

describe('streetLevels', () => {
  it('cuts the centreline no coarser than the step and keeps both ends', () => {
    const { stations, levelM } = streetLevels([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 21 }], hillside, 8)
    expect(stations[0]).toEqual({ x: 0, y: 0 })
    expect(stations[stations.length - 1]).toEqual({ x: 50, y: 21 })
    for (let i = 1; i < stations.length; i++) {
      expect(Math.hypot(stations[i].x - stations[i - 1].x, stations[i].y - stations[i - 1].y)).toBeLessThanOrEqual(8 + 1e-9)
    }
    expect(levelM).toHaveLength(stations.length)
  })

  it('follows a steady grade exactly and holds the ends where neighbours meet', () => {
    // Straight up the slope: the ground along it is a ramp, and stays one.
    const { stations, levelM } = streetLevels([{ x: 0, y: 0 }, { x: 0, y: 80 }], hillside, 8)
    stations.forEach((p, i) => expect(levelM[i]).toBeCloseTo(hillside(p.x, p.y), 9))
  })

  it('takes a one-cell spike of the raster out of the street', () => {
    const spiky = (x: number, y: number): number => hillside(x, y) + (Math.abs(x - 40) < 1 ? 3 : 0)
    const { stations, levelM } = streetLevels([{ x: 0, y: 0 }, { x: 80, y: 0 }], spiky, 8)
    const at40 = stations.findIndex((p) => Math.abs(p.x - 40) < 1e-9)
    expect(at40).toBeGreaterThan(0)
    expect(levelM[at40] - 100).toBeLessThan(1.5)
  })
})

describe('createStreetGrading', () => {
  // A street along the contour (y = 0), 8 m wide.
  const way = { points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], halfWidthM: 4 }
  const grade = createStreetGrading([way], { groundM: hillside, spacingM: SPACING })!

  it('has nothing to say without a way', () => {
    expect(createStreetGrading([], { groundM: hillside, spacingM: SPACING })).toBeNull()
    expect(createStreetGrading([{ points: [{ x: 0, y: 0 }], halfWidthM: 4 }], { groundM: hillside, spacingM: SPACING })).toBeNull()
  })

  it('levels the ground across the whole carriageway and its shoulder', () => {
    const core = 4 + SPACING * SHOULDER_PER_SPACING
    for (const y of [-core, -4, -1, 0, 2, 4, core]) {
      expect(grade(10, y, hillside(10, y))).toBeCloseTo(100, 6)
    }
  })

  it('no longer buries the uphill kerb — the defect this exists for', () => {
    // Before: 4 m uphill of the centreline the hillside stood 1.2 m above a
    // street that is lifted 25 cm.
    expect(hillside(0, 4) - 100).toBeCloseTo(1.2, 9)
    expect(grade(0, 4, hillside(0, 4)) - 100).toBeLessThan(0.01)
  })

  it('returns to the measured hillside over a bank, uphill and down', () => {
    const core = 4 + SPACING * SHOULDER_PER_SPACING
    for (const side of [1, -1]) {
      let last = 100
      for (let d = core; d <= core + MAX_BANK_M + 6; d += 1) {
        const y = side * d
        const h = grade(0, y, hillside(0, y))
        // Monotonic away from the street: a cut above it, a fill below.
        if (side > 0) expect(h).toBeGreaterThanOrEqual(last - 1e-9)
        else expect(h).toBeLessThanOrEqual(last + 1e-9)
        // And never past the hillside it is returning to.
        if (side > 0) expect(h).toBeLessThanOrEqual(hillside(0, y) + 1e-9)
        else expect(h).toBeGreaterThanOrEqual(hillside(0, y) - 1e-9)
        last = h
      }
      const far = side * (core + MAX_BANK_M + 1)
      expect(grade(0, far, hillside(0, far))).toBe(hillside(0, far))
    }
  })

  it('makes the bank as wide as the height it has to make up', () => {
    // 2 m of height to make up → a 3 m bank at 1 : 1.5, but never narrower
    // than the mesh: here the mesh (8 m) wins. 8 m to make up → 12 m of bank.
    const core = 4 + SPACING * SHOULDER_PER_SPACING
    const shallow = grade(0, core + SPACING, 102)
    expect(shallow).toBe(102)
    const deepRun = 8 * BANK_RUN
    expect(grade(0, core + deepRun - 0.5, 108)).toBeLessThan(108)
    expect(grade(0, core + deepRun, 108)).toBe(108)
  })

  it('leaves level ground exactly as measured', () => {
    const flat = (): number => 12
    const g = createStreetGrading([way], { groundM: flat, spacingM: SPACING })!
    for (const [x, y] of [[0, 0], [3, 5], [40, -12], [0, 30]]) expect(g(x, y, 12)).toBeCloseTo(12, 9)
  })

  it('touches nothing out of reach of any street', () => {
    expect(grade(0, 200, 160)).toBe(160)
    expect(grade(500, 500, 250)).toBe(250)
  })

  it('follows the street as it climbs, level across at every station', () => {
    // Straight up the slope: the bench climbs with the street.
    const up = createStreetGrading(
      [{ points: [{ x: 0, y: -80 }, { x: 0, y: 80 }], halfWidthM: 4 }],
      { groundM: hillside, spacingM: SPACING },
    )!
    for (const y of [-40, 0, 37]) {
      for (const x of [-6, 0, 6]) expect(up(x, y, hillside(x, y))).toBeCloseTo(hillside(0, y), 6)
    }
  })

  it('lets the carriageway set the level of the pavement mapped beside it', () => {
    // A pavement drawn as its own way 6 m uphill reads the hillside 1.8 m
    // above the road. The kerb between them belongs to the road.
    const g = createStreetGrading([
      way,
      { points: [{ x: -100, y: 6 }, { x: 100, y: 6 }], halfWidthM: 1 },
    ], { groundM: hillside, spacingM: SPACING })!
    for (const y of [0, 2, 4]) expect(g(0, y, hillside(0, y)) - 100).toBeLessThan(0.05)
    // And the pavement itself comes down to it — a kerb's height above the
    // road, not the 1.8 m ledge its own centreline read off the hillside.
    expect(g(0, 6, hillside(0, 6)) - 100).toBeLessThan(0.3)
  })

  it('gives each of two close streets its own carriageway, though their shoulders overlap', () => {
    // The El Carmel case: two contour streets 16 m apart and 4.8 m apart in
    // level. On a mesh this coarse their benches overlap at full weight.
    const g = createStreetGrading([
      { points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], halfWidthM: 2.75 },
      { points: [{ x: -100, y: 16 }, { x: 100, y: 16 }], halfWidthM: 3.25 },
    ], { groundM: hillside, spacingM: SPACING })!
    for (const y of [-2.75, 0, 2.75]) expect(Math.abs(g(0, y, hillside(0, y)) - 100)).toBeLessThan(0.3)
    for (const y of [12.75, 16, 19.25]) {
      expect(Math.abs(g(0, y, hillside(0, y)) - hillside(0, 16))).toBeLessThan(0.3)
    }
  })

  it('keeps a street on its own bench when the next contour street is 25 m uphill', () => {
    // Terraced streets: the upper one's bank reaches the lower one's kerb.
    const g = createStreetGrading([
      way,
      { points: [{ x: -100, y: 25 }, { x: 100, y: 25 }], halfWidthM: 4 },
    ], { groundM: hillside, spacingM: SPACING })!
    for (const y of [-4, 0, 4]) expect(Math.abs(g(0, y, hillside(0, y)) - 100)).toBeLessThan(0.05)
    for (const y of [21, 25, 29]) expect(Math.abs(g(0, y, hillside(0, y)) - hillside(0, 25))).toBeLessThan(0.05)
    // And between them the ground climbs from one to the other without a step.
    let last = g(0, 4, hillside(0, 4))
    for (let y = 4.5; y <= 21; y += 0.5) {
      const h = g(0, y, hillside(0, y))
      expect(h).toBeGreaterThanOrEqual(last - 1e-9)
      expect(h - last).toBeLessThan(1.2)
      last = h
    }
  })

  it('is continuous where two streets at different levels meet', () => {
    // A cross-slope street and one coming down the hill onto it.
    const g = createStreetGrading([
      way,
      { points: [{ x: 0, y: 0 }, { x: 0, y: 90 }], halfWidthM: 3 },
    ], { groundM: hillside, spacingM: SPACING })!
    let last = g(-40, 2, hillside(-40, 2))
    let worst = 0
    for (let x = -40; x <= 40; x += 0.5) {
      const h = g(x, 2 + (x + 40) * 0.4, hillside(x, 2 + (x + 40) * 0.4))
      worst = Math.max(worst, Math.abs(h - last))
      last = h
    }
    // Half-metre steps in plan; no jump a mesh would show as a cliff.
    expect(worst).toBeLessThan(0.6)
  })
})
