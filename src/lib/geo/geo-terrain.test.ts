// ─── geo-terrain tests (pure parts) ───────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { tileNormalizedCenter } from './geo-terrain'
import { latLonToTile, normalizedToLatLon } from './geo-math'

describe('tileNormalizedCenter', () => {
  it('centres the single zoom-0 tile at the origin', () => {
    const c = tileNormalizedCenter(0, 0, 0)
    expect(c.nx).toBe(0)
    expect(c.ny).toBe(0)
    expect(c.size).toBe(1)
  })

  it('maps zoom-1 quadrants with slippy y growing south', () => {
    // Tile (0,0) at z1 is the north-west quadrant → negative nx, positive ny
    const nw = tileNormalizedCenter(0, 0, 1)
    expect(nw.nx).toBe(-0.25)
    expect(nw.ny).toBe(0.25)
    const se = tileNormalizedCenter(1, 1, 1)
    expect(se.nx).toBe(0.25)
    expect(se.ny).toBe(-0.25)
    expect(nw.size).toBe(0.5)
  })

  it('round-trips with the slippy tile math for a real location', () => {
    const lat = 41.3851, lon = 2.1734, zoom = 13
    const t = latLonToTile(lat, lon, zoom)
    const c = tileNormalizedCenter(t.x, t.y, zoom)
    // The tile centre, inverted back to WGS84, must be within half a tile
    // of the original point.
    const back = normalizedToLatLon(c.nx, c.ny)
    const tileDeg = 360 / Math.pow(2, zoom)
    expect(Math.abs(back.lon - lon)).toBeLessThan(tileDeg)
    expect(Math.abs(back.lat - lat)).toBeLessThan(tileDeg)
  })
})
