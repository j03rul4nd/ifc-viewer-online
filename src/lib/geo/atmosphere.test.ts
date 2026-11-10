import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildSkyDomePixels, equirectDirection, hazeAt, hazeRangeChanged, hazeRangeFor, sunDirection,
  HAZE_BAND_DEG, HAZE_FAR_CAP_M, HAZE_MIN_NEAR_M,
} from './atmosphere'
import { LIGHT_PRESETS, hexToRgb } from './map-look'
import { buildSkyTexture } from './sky-environment'

describe('equirectDirection', () => {
  it('is the inverse of the lookup three.js does on an equirectangular map', () => {
    // three: u = atan(z, x) / 2π + 0.5, v = asin(y) / π + 0.5; row 0 is v = 0.
    const W = 64, H = 32
    for (const [col, row] of [[0, 0], [10, 3], [31, 16], [50, 29], [63, 31]]) {
      const d = equirectDirection(col, row, W, H)
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9)
      const u = Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5
      const v = Math.asin(d.y) / Math.PI + 0.5
      expect(u * W - 0.5).toBeCloseTo(col, 6)
      expect(v * H - 0.5).toBeCloseTo(row, 6)
    }
  })

  it('puts the nadir in the first row and the zenith in the last', () => {
    expect(equirectDirection(0, 0, 8, 64).y).toBeLessThan(-0.99)
    expect(equirectDirection(0, 63, 8, 64).y).toBeGreaterThan(0.99)
  })
})

describe('sunDirection', () => {
  it('points north for azimuth 0, east for 90, and up for altitude 90', () => {
    const n = sunDirection(0, 0)
    expect(n.z).toBeCloseTo(-1, 9) // north is −Z in the viewer
    const e = sunDirection(90, 0)
    expect(e.x).toBeCloseTo(1, 9)
    expect(sunDirection(123, 90).y).toBeCloseTo(1, 9)
  })
})

describe('hazeRangeFor', () => {
  it('leaves the subject clear and takes a little off everything behind it', () => {
    for (const d of [50, 300, 1500, 8000]) {
      const r = hazeRangeFor(d)
      expect(hazeAt(r, d * 0.8)).toBe(0)
      // Twice as far as the subject there is air, but nowhere near a wall of it.
      const behind = hazeAt(r, Math.max(d * 2, HAZE_MIN_NEAR_M * 2))
      expect(behind).toBeGreaterThan(0)
      expect(behind).toBeLessThan(0.2)
    }
  })

  it('always closes before the far plane, so the map never reaches the horizon at full contrast', () => {
    for (const d of [0, 10, 300, 1500, 8000, 30_000]) {
      const r = hazeRangeFor(d)
      expect(r.farM).toBeLessThanOrEqual(HAZE_FAR_CAP_M)
      expect(r.farM - r.nearM).toBeGreaterThanOrEqual(1_000)
      expect(hazeAt(r, 60_000)).toBe(1)
    }
  })

  it('never hazes what is within reach, however close the camera is', () => {
    expect(hazeRangeFor(2).nearM).toBe(HAZE_MIN_NEAR_M)
    expect(hazeRangeFor(Number.NaN).nearM).toBe(HAZE_MIN_NEAR_M)
  })

  it('keeps the district readable from a district view', () => {
    // 1.5 km out: the far edge of the buildings (≈ 2.2 km) is still nine-tenths itself.
    const r = hazeRangeFor(1500)
    expect(hazeAt(r, 2200)).toBeLessThan(0.1)
    expect(hazeAt(r, 20_000)).toBeGreaterThan(0.4)
  })

  it('thins with the look strength', () => {
    const full = hazeRangeFor(1000)
    const thin = hazeRangeFor(1000, 0.4)
    expect(hazeAt(thin, 5000)).toBeLessThan(hazeAt(full, 5000))
    expect(thin.farM).toBeLessThanOrEqual(HAZE_FAR_CAP_M)
  })
})

describe('hazeRangeChanged', () => {
  it('ignores what the eye cannot see and reports what it can', () => {
    const a = hazeRangeFor(1000)
    expect(hazeRangeChanged(null, a)).toBe(true)
    expect(hazeRangeChanged(a, hazeRangeFor(1005))).toBe(false)
    expect(hazeRangeChanged(a, hazeRangeFor(1500))).toBe(true)
  })
})

describe('buildSkyDomePixels', () => {
  const day = LIGHT_PRESETS.day
  const opts = {
    zenith: day.sky.zenith, horizon: day.sky.horizon, haze: day.fog,
    sunHigh: day.sky.sunHigh, sunLow: day.sky.sunLow,
    sunAzimuthDeg: 180, sunAltitudeDeg: 40, width: 64, height: 128,
  }
  const texel = (px: { data: Uint8Array; width: number }, col: number, row: number): number[] =>
    [...px.data.slice((row * px.width + col) * 4, (row * px.width + col) * 4 + 3)]
  const rgb8 = (hex: string): number[] => hexToRgb(hex).map((c) => Math.round(c * 255))
  const rowAt = (deg: number, height: number): number => Math.round((deg / 180 + 0.5) * height - 0.5)

  it('is exactly the fog colour at and below the horizon, in every direction', () => {
    const px = buildSkyDomePixels(opts)
    const fog = rgb8(day.fog)
    for (const row of [0, 20, 63]) {
      for (const col of [0, 17, 40, 63]) expect(texel(px, col, row)).toEqual(fog)
    }
  })

  it('leaves the haze band for the sky above it, away from the sun', () => {
    const px = buildSkyDomePixels(opts)
    // North (away from a southern sun): −Z is u = 0.25 → column 16.
    const north = 16
    const justUp = texel(px, north, rowAt(1, px.height))
    const fog = rgb8(day.fog)
    for (let k = 0; k < 3; k++) expect(Math.abs(justUp[k] - fog[k])).toBeLessThanOrEqual(8)
    // Overhead it is the zenith: far bluer than the haze.
    const top = texel(px, north, px.height - 1)
    const zen = rgb8(day.sky.zenith)
    for (let k = 0; k < 3; k++) expect(Math.abs(top[k] - zen[k])).toBeLessThanOrEqual(10)
    // And it gets there without turning back (red only falls as we climb).
    let last = Infinity
    for (const deg of [HAZE_BAND_DEG, 20, 45, 80]) {
      const red = texel(px, north, rowAt(deg, px.height))[0]
      expect(red).toBeLessThanOrEqual(last)
      last = red
    }
  })

  it('gathers light around the sun, where the sun is', () => {
    const px = buildSkyDomePixels(opts)
    const row = rowAt(40, px.height)
    // South is +Z → u = 0.75 → column 48; north is column 16.
    const atSun = texel(px, 48, row)
    const away = texel(px, 16, row)
    expect(atSun[0] + atSun[1] + atSun[2]).toBeGreaterThan(away[0] + away[1] + away[2] + 60)
  })

  it('paints no sun once it has set', () => {
    const px = buildSkyDomePixels({ ...opts, sunAltitudeDeg: -10 })
    const row = rowAt(5, px.height)
    expect(texel(px, 48, row)).toEqual(texel(px, 16, row))
  })
})

describe('the environment that lights the scene', () => {
  it('has the sky overhead and the ground underfoot', () => {
    const tex = buildSkyTexture({ sunAzimuthDeg: 180, sunAltitudeDeg: 45 })
    const { data, width, height } = tex.image as unknown as { data: Float32Array; width: number; height: number }
    const at = (row: number): THREE.Color => {
      const o = (row * width + 10) * 4
      return new THREE.Color(data[o], data[o + 1], data[o + 2])
    }
    // three samples the LAST row for +Y. It must be sky: bluer than it is red
    // (tempered as a light, so not by much — see SKY_LIGHT_CHROMA).
    const up = at(height - 1)
    const down = at(0)
    expect(up.b).toBeGreaterThan(up.r * 1.3)
    // The ground bounce is dim and neutral.
    expect(down.r + down.g + down.b).toBeLessThan(up.r + up.g + up.b)
    expect(Math.abs(down.b - down.r)).toBeLessThan(0.1)
    tex.dispose()
  })

  it('has its sun where the key light comes from', () => {
    const tex = buildSkyTexture({ sunAzimuthDeg: 90, sunAltitudeDeg: 30 })
    const { data, width, height } = tex.image as unknown as { data: Float32Array; width: number; height: number }
    let best = -1, bestCol = 0, bestRow = 0
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const o = (row * width + col) * 4
        const lum = data[o] + data[o + 1] + data[o + 2]
        if (lum > best) { best = lum; bestCol = col; bestRow = row }
      }
    }
    const d = equirectDirection(bestCol, bestRow, width, height)
    const s = sunDirection(90, 30)
    expect(d.x * s.x + d.y * s.y + d.z * s.z).toBeGreaterThan(0.995)
    tex.dispose()
  })
})
