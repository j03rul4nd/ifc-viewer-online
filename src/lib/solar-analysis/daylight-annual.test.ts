import { describe, it, expect } from 'vitest'
import { typicalSkyHours, tregenzaPatches, patchOf, diffuseLuminance, annualIlluminance, roomAnnual, type SkyHour } from './daylight-annual'

const D = Math.PI / 180

describe('annual daylight', () => {
  const patches = tregenzaPatches(2)

  it('145 Tregenza patches covering the hemisphere', () => {
    expect(patches).toHaveLength(145)
    expect(patches.reduce((a, p) => a + p.omega, 0)).toBeCloseTo(2 * Math.PI, 6)
    expect(patchOf(5, 5)).toBe(0)
    expect(patchOf(359, 5)).toBe(29)
    expect(patchOf(0, 13)).toBe(30)
    expect(patchOf(10, 89)).toBe(144)
  })

  it('diffuse luminance gives back the horizontal illuminance it was scaled to', () => {
    const L = diffuseLuminance(patches, 10000)
    const e = patches.reduce((a, p, i) => a + L[i] * p.omega * Math.sin(p.alt * D), 0)
    expect(e).toBeCloseTo(10000, 3)
    expect(L[144]).toBeGreaterThan(L[0] * 2)
  })

  // An open point sees every patch: c = ω sin h.
  const open = Float32Array.from(patches.map((p) => p.omega * Math.sin(p.alt * D)))
  const hour = (o: Partial<SkyHour>): SkyHour => ({ sunAz: 180, sunAlt: 40, dni: 0, dhi: 100, weight: 1, occupied: true, ...o })

  it('an open point under 100 W/m² of diffuse reads ~12 000 lx × T', () => {
    const a = annualIlluminance(open, 1, [hour({ dhi: 100 })], { transmittance: 1, irc: new Float32Array([0]), roomOf: new Int32Array([0]), patches })
    expect(a.da750[0]).toBe(1)
    // A dark hour (dhi 2 → 240 lx) misses 300 lx.
    const b = annualIlluminance(open, 1, [hour({ dhi: 2, dni: 0 })], { transmittance: 1, irc: new Float32Array([0]), roomOf: new Int32Array([0]), patches })
    expect(b.da300[0]).toBe(0)
    expect(b.da100[0]).toBe(1)
  })

  it('direct sun counts for ASE only where its patch is seen', () => {
    const blind = new Float32Array(open)
    blind[patchOf(180, 40)] = 0
    const coef = new Float32Array([...open, ...blind])
    const hours = Array.from({ length: 300 }, () => hour({ dni: 600, dhi: 50 }))
    const a = annualIlluminance(coef, 2, hours, { transmittance: 0.7, irc: new Float32Array([0]), roomOf: new Int32Array([0, 0]), patches })
    expect(a.sunHours1000[0]).toBe(300)
    expect(a.sunHours1000[1]).toBe(0)
    const r = roomAnnual([0, 1], a)
    expect(r.ASE).toBe(0.5)
  })

  it('with the sun pass, a point either sees the sun or not — a sliver of its patch is not sun', () => {
    const coef = new Float32Array([...open, ...open])
    const hours = Array.from({ length: 300 }, () => hour({ dni: 600, dhi: 50 }))
    const sunVis = new Float32Array([1, 0]) // point 0 sees the sun, point 1 not
    const a = annualIlluminance(coef, 2, hours, {
      transmittance: 0.7, irc: new Float32Array([0]), roomOf: new Int32Array([0, 0]), patches,
      sunVis, sunHours: 1, sunIndex: new Int32Array(300).fill(0),
    })
    expect(a.sunHours1000[0]).toBe(300)
    expect(a.sunHours1000[1]).toBe(0)
  })

  it('reflections take a share of the diffuse only', () => {
    const dark = new Float32Array(145)
    const a = annualIlluminance(dark, 1, [hour({ dni: 800, dhi: 50 })], { transmittance: 0.7, irc: new Float32Array([3]), roomOf: new Int32Array([0]), patches })
    // 3 % of 6 000 lx diffuse = 180 lx: under 300 although the sun outside gives ~50 000 lx.
    expect(a.da100[0]).toBe(1)
    expect(a.da300[0]).toBe(0)
  })

  it('room level: EN 17037 by hours, sDA', () => {
    const pts = 10
    const coef = new Float32Array(pts * 145)
    for (let i = 0; i < 6; i++) coef.set(open, i * 145) // 6 bright points, 4 dark
    const hours = Array.from({ length: 10 }, () => hour({ dhi: 100 }))
    const a = annualIlluminance(coef, pts, hours, { transmittance: 0.7, irc: new Float32Array([0.5]), roomOf: new Int32Array(pts), patches })
    const r = roomAnnual(Array.from({ length: pts }, (_, i) => i), a)
    // Dark points get the reflected 0.5 % of 12 000 lx = 60 lx: under 100 → not 95 % at 100 lx.
    expect(r.share300).toBeCloseTo(0.6, 6)
    expect(r.level).toBe('none')
    expect(r.sDA).toBeCloseTo(0.6, 6)
  })
})

describe('typical sky hours', () => {
  it('12 × 24 hours, the whole year, 10 occupied hours a day, sky only by day', () => {
    const h = typicalSkyHours({ lat: 41.39, lon: 2.17, yawDeg: 0, timeZone: 'Europe/Madrid', year: 2026 })
    expect(h).toHaveLength(288)
    expect(h.reduce((a, x) => a + x.weight, 0)).toBe(24 * 365)
    expect(h.filter((x) => x.occupied).reduce((a, x) => a + x.weight, 0)).toBe(10 * 365)
    expect(h.every((x) => x.sunAlt > 0 || (x.dni === 0 && x.dhi === 0))).toBe(true)
    // June noon: a high sun with a clear-sky beam.
    const june = h.filter((x) => x.weight === 30 && x.sunAlt > 65)
    expect(june.length).toBeGreaterThan(0)
    expect(june[0].dni).toBeGreaterThan(700)
  })
})
