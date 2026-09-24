// ─── marina-boats tests ───────────────────────────────────────────────────────
// Placement against the real Port Vell capture: the berth plan comes from the
// pontoons' own names and widths, and every boat must float — in water, off
// every other pontoon, clear of the boat beside it.

import { describe, it, expect } from 'vitest'
import portvell from './__fixtures__/portvell.json'
import { parseOsmFeatures, type LatLonPoint } from './osm-features'
import { buildWaterMask } from './osm-scene'
import { latLonToNormalized, metresToNormalized } from './geo-math'
import { berthCount, planMooredBoats } from './marina-boats'

const fx = portvell as unknown as { _bbox: { south: number; west: number; north: number; east: number } }
const LAT = (fx._bbox.south + fx._bbox.north) / 2
const LON = (fx._bbox.west + fx._bbox.east) / 2
const features = parseOsmFeatures(portvell, { bbox: fx._bbox })
const mToN = metresToNormalized(LAT)
const origin = latLonToNormalized(LAT, LON)
const toLocal = (p: LatLonPoint) => {
  const n = latLonToNormalized(p.lat, p.lon)
  return { x: (n.nx - origin.nx) / mToN, y: (n.ny - origin.ny) / mToN }
}
const mask = buildWaterMask(features, { mToN })!
const isWater = (p: { x: number; y: number }) => mask(origin.nx + p.x * mToN, origin.ny + p.y * mToN)

describe('berthCount', () => {
  it('reads the berth numbers a pontoon is named for', () => {
    expect(berthCount('Nr 40-67')).toBe(28)
    expect(berthCount('Nr 13-19')).toBe(7)
    expect(berthCount('Moll de la Fusta')).toBeUndefined()
    expect(berthCount(undefined)).toBeUndefined()
  })
})

describe('planMooredBoats on Port Vell', () => {
  const boats = planMooredBoats(features, toLocal, isWater)

  it('fills the marinas', () => {
    expect(mask).toBeTruthy()
    expect(boats.length).toBeGreaterThan(40)
  })

  it('floats every boat, square to its pontoon, clear of the next one', () => {
    for (const b of boats) {
      const dx = Math.cos(b.yaw) * b.lengthM / 2, dy = Math.sin(b.yaw) * b.lengthM / 2
      expect(isWater({ x: b.x, y: b.y })).toBe(true)
      expect(isWater({ x: b.x + dx, y: b.y + dy })).toBe(true)   // the bow
    }
    // No two boats share a berth.
    for (let i = 0; i < boats.length; i++) for (let j = i + 1; j < boats.length; j++) {
      expect(Math.hypot(boats[i].x - boats[j].x, boats[i].y - boats[j].y)).toBeGreaterThan(2.4)
    }
  })

  it('spaces the berths of "Nr 40-67" from its own name', () => {
    // 81 m of pontoon, 28 berths, fourteen a side: one every ~5.8 m.
    const pontoon = features.find((f) => f.name === 'Nr 40-67')!
    const pts = pontoon.ring!.map(toLocal)
    const d = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }
    const len = Math.hypot(d.x, d.y)
    const onIt = boats.filter((b) => {
      const t = ((b.x - pts[0].x) * d.x + (b.y - pts[0].y) * d.y) / (len * len)
      const off = Math.abs((b.x - pts[0].x) * d.y - (b.y - pts[0].y) * d.x) / len
      return t > 0 && t < 1 && off < 12
    })
    expect(onIt.length).toBeGreaterThan(14)
    expect(onIt.length).toBeLessThanOrEqual(28)
  })
})

describe('planLakeBoats on the Ciutadella', async () => {
  const { planLakeBoats } = await import('./marina-boats')
  const cfx = (await import('./__fixtures__/barcelona-ciutadella.json')).default as unknown as { _bbox: { south: number; west: number; north: number; east: number } }
  const cf = parseOsmFeatures(cfx, { bbox: cfx._bbox })
  const cLat = (cfx._bbox.south + cfx._bbox.north) / 2, cLon = (cfx._bbox.west + cfx._bbox.east) / 2
  const cm = metresToNormalized(cLat), co = latLonToNormalized(cLat, cLon)
  const loc = (p: LatLonPoint) => { const n = latLonToNormalized(p.lat, p.lon); return { x: (n.nx - co.nx) / cm, y: (n.ny - co.ny) / cm } }
  const boats = planLakeBoats(cf, loc)
  const cmask = buildWaterMask(cf, { mToN: cm })!
  it('puts rowing boats on the park lake, and only on water', () => {
    expect(boats.length).toBeGreaterThan(3)
    for (const b of boats) expect(cmask(co.nx + b.x * cm, co.ny + b.y * cm)).toBe(true)
  })
})
