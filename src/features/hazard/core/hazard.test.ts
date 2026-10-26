// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { adjustMoisture, curveNumber, initialAbstractionMm, runoffMm, stepRunoffGrid } from './scs-cn'
import { d8Receivers, flowAccumulation, slopeRad, type Dem } from './terrain'
import {
  DEFAULT_SOIL, factorOfSafety, failureProbability, sampleSoil, wetnessFrom,
} from './infinite-slope'
import { debrisRunout } from './debris'
import { rainLadder, runHazard } from './storm'

const deg = (d: number): number => (d * Math.PI) / 180

/** A plane rising along +y at `angleDeg`, with a flat valley floor in the first `floorRows` rows. */
function valley(nx: number, ny: number, dx: number, angleDeg: number, floorRows = 0): Dem {
  const z = new Float32Array(nx * ny)
  const t = Math.tan(deg(angleDeg))
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) z[j * nx + i] = Math.max(0, j - floorRows) * dx * t
  }
  return { nx, ny, dx, z }
}

describe('SCS curve number', () => {
  it('matches the TR-55 worked value (CN 80, P = 125 mm)', () => {
    // S = 63.5 mm, Ia = 12.7 mm → Q = 112.3² / 175.8 = 71.74 mm
    expect(runoffMm(125, 80)).toBeCloseTo(71.74, 1)
  })
  it('gives no runoff below the initial abstraction and all of it at CN 100', () => {
    expect(runoffMm(initialAbstractionMm(70) - 0.01, 70)).toBe(0)
    expect(runoffMm(40, 100)).toBe(40)
  })
  it('orders moisture conditions and soil groups', () => {
    expect(adjustMoisture(75, 'I')).toBeLessThan(75)
    expect(adjustMoisture(75, 'III')).toBeGreaterThan(75)
    expect(curveNumber('forest', 'A')).toBeLessThan(curveNumber('forest', 'D'))
  })
  it('conserves rain: runoff + retained per step add up to the step rain', () => {
    const cum = [10, 30, 60, 100]
    const { runoff, retained } = stepRunoffGrid(new Float32Array([70, 90]), cum)
    let prev = 0
    cum.forEach((p, k) => {
      for (let c = 0; c < 2; c++) expect(runoff[k * 2 + c] + retained[k * 2 + c]).toBeCloseTo(p - prev, 4)
      prev = p
    })
  })
})

describe('terrain', () => {
  it('measures the slope of a plane', () => {
    const s = slopeRad(valley(10, 10, 5, 30))
    expect(s[5 * 10 + 5]).toBeCloseTo(deg(30), 4)
  })
  it('routes downhill and accumulates the whole hillside at the toe', () => {
    const dem = valley(3, 6, 10, 20)
    const r = d8Receivers(dem)
    expect(r[3 * 3 + 1]).toBe(2 * 3 + 1)
    const acc = flowAccumulation(dem, r)
    // Column 1 drains straight down: its toe collects the six cells above (incl. itself).
    expect(acc[1]).toBeGreaterThanOrEqual(6 * 100)
  })
})

describe('infinite slope', () => {
  it('reduces to tanφ / tanβ for a dry cohesionless soil', () => {
    const fs = factorOfSafety(deg(30), 0, { cohesionKPa: 0, frictionDeg: 35, unitWeightKNm3: 18, depthM: 1 })
    expect(fs).toBeCloseTo(Math.tan(deg(35)) / Math.tan(deg(30)), 6)
  })
  it('lowers FS as the layer saturates', () => {
    const p = { cohesionKPa: 3, frictionDeg: 32, unitWeightKNm3: 18, depthM: 1.5 }
    expect(factorOfSafety(deg(35), 1, p)).toBeLessThan(factorOfSafety(deg(35), 0, p))
  })
  it('is reproducible and monotone in slope and wetness', () => {
    const samples = sampleSoil(DEFAULT_SOIL, 300, 7)
    expect(sampleSoil(DEFAULT_SOIL, 300, 7)).toEqual(samples)
    const beta = new Float32Array([deg(10), deg(30), deg(40), deg(50)])
    const dry = failureProbability(beta, new Float32Array(4).fill(0), samples)
    const wet = failureProbability(beta, new Float32Array(4).fill(1), samples)
    expect(dry[0]).toBe(0)
    for (let i = 1; i < 4; i++) {
      expect(dry[i]).toBeGreaterThanOrEqual(dry[i - 1])
      expect(wet[i]).toBeGreaterThanOrEqual(dry[i])
    }
    expect(wet[3]).toBeGreaterThan(0.9)
  })
  it('saturates hollows before ridges', () => {
    const w = wetnessFrom(new Float32Array([40, 40]), new Float32Array([100, 50000]), 10, 1.5)
    expect(w[1]).toBeGreaterThan(w[0])
    expect(w[1]).toBeLessThanOrEqual(1)
  })
})

describe('debris runout', () => {
  it('runs down the slope and over the flat floor until the travel angle is spent', () => {
    const dem = valley(3, 80, 10, 35, 60)
    const p = new Float32Array(dem.z.length)
    p[79 * 3 + 1] = 1 // the top of the middle column fails
    const r = debrisRunout(dem, p, { sourceThreshold: 0.5, travelAngleDeg: 12, maxSteps: 1000 })
    expect(r.sources).toBe(1)
    const dep = r.deposit.findIndex((v) => v > 0)
    const row = Math.floor(dep / 3)
    // H = 19 rows · 10 m · tan35° = 133 m; reach L = H / tan12° = 626 m from row 79 → row 16–17.
    expect(row).toBeGreaterThanOrEqual(15)
    expect(row).toBeLessThanOrEqual(18)
    expect(r.path[40 * 3 + 1]).toBe(1)
  })
})

describe('storm sweep', () => {
  it('finds a critical rainfall for an element below an unstable slope, and none on a flat', () => {
    const dem = valley(5, 40, 10, 38, 10)
    const n = dem.z.length
    const cn = new Float32Array(n).fill(75)
    const toe = 5 * 5 + 2
    const far = n - 1 - 2
    const res = runHazard({
      dem, cn, cumRainMm: rainLadder(300, 20), samples: 200, runoffThresholdMm: Infinity,
      elements: [
        { id: 'house', name: 'House', kind: 'housing', cells: [toe] },
        { id: 'flat', name: 'Flat', kind: 'other', cells: [0] },
        { id: 'top', name: 'Ridge', kind: 'school', cells: [far] },
      ],
    })
    const house = res.critical[0]
    expect(house.rainMm).not.toBeNull()
    expect(house.cause).toBe('debris')
    // On a flat plain nothing fails, nothing flows, and the runoff stays below 50 mm.
    const plain = runHazard({
      dem: valley(5, 5, 10, 0), cn: new Float32Array(25).fill(75), cumRainMm: [50, 100],
      elements: [{ id: 'flat', name: 'Flat', kind: 'other', cells: [12] }],
    })
    expect(plain.critical[0]).toEqual({ id: 'flat', rainMm: null, cause: null })
    // Instability grows with rain.
    const mid = 25 * 5 + 2
    expect(res.steps.at(-1)!.pFail[mid]).toBeGreaterThanOrEqual(res.steps[0].pFail[mid])
    expect(rainLadder(100, 25)).toEqual([25, 50, 75, 100])
  })
})
