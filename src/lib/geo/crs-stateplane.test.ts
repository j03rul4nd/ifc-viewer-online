import { describe, it, expect } from 'vitest'
import proj4 from 'proj4'
import { resolveStatePlane, statePlaneZones } from './crs-stateplane'
import { resolveCrs, gridToWgs84, wgs84ToGrid } from './crs'
import authoritative from './__fixtures__/stateplane-authoritative.json'

interface Authoritative { code: number; name: string; proj4: string }
const AUTH = authoritative as Authoritative[]

describe('crs-stateplane · the compact table reproduces the authoritative definitions', () => {
  // This is the point of the whole file. `crs-stateplane.ts` stores only the
  // parameters that differ between zones and rebuilds the rest, which is a
  // saving that would be worthless if the rebuilt string were subtly different.
  // So: project real coordinates through BOTH strings and demand they agree.
  //
  // The fixture is what epsg.io served, committed verbatim. If a future edit
  // corrupts a standard parallel, this fails with the zone named.

  it('carries every zone that was fetched', () => {
    expect(AUTH.length).toBeGreaterThan(250)
    for (const row of AUTH) {
      expect(resolveStatePlane(`EPSG:${row.code}`), `EPSG:${row.code} missing`).not.toBeNull()
    }
    expect(statePlaneZones()).toHaveLength(AUTH.length)
  })

  it('projects identically to the authoritative string, zone by zone', () => {
    const mismatches: string[] = []

    for (const row of AUTH) {
      const built = resolveStatePlane(`EPSG:${row.code}`)!
      const toAuth = proj4('EPSG:4326', row.proj4)
      const toOurs = proj4('EPSG:4326', built.def)

      // Sample geographically AROUND THE ZONE'S OWN ORIGIN, spread over a few
      // degrees. A wrong standard parallel can agree at the origin and diverge
      // by metres a hundred kilometres out, which is precisely the error a
      // single-point check waves through — and sampling somewhere the zone does
      // not cover just makes proj4 throw.
      const lat0 = parseFloat(/\+lat_0=([-\d.]+)/.exec(row.proj4)![1])
      const lon0 = parseFloat(
        (/\+lon_0=([-\d.]+)/.exec(row.proj4) ?? /\+lonc=([-\d.]+)/.exec(row.proj4))![1],
      )

      for (const [dLon, dLat] of [[0, 0.5], [-1.2, 2], [1.2, 2], [-0.6, 3.5], [0.6, 0.2]]) {
        const p: [number, number] = [lon0 + dLon, lat0 + dLat]
        let a: number[], b: number[]
        try {
          a = toAuth.forward(p)
          b = toOurs.forward(p)
        } catch {
          continue                       // outside this zone's valid range
        }
        if (!Number.isFinite(a[0]) || !Number.isFinite(b[0])) continue

        // Both sides are in the zone's own units. Equivalent strings agree to
        // the last bit; 1e-6 is a micrometre of slack, not a tolerance.
        if (Math.abs(a[0] - b[0]) > 1e-6 || Math.abs(a[1] - b[1]) > 1e-6) {
          mismatches.push(
            `EPSG:${row.code} (${row.name}) at ${p[1]}°,${p[0]}°: ` +
            `authoritative ${a[0]},${a[1]} vs ours ${b[0]},${b[1]}`,
          )
          break
        }
      }
    }

    expect(mismatches, `zones whose rebuilt definition does not match:\n${mismatches.join('\n')}`)
      .toEqual([])
  })

  it('keeps the declared unit, because feet and metres are not interchangeable', () => {
    // Colorado South is published in both: EPSG:26955 in metres, EPSG:2233 in US
    // survey feet. Same ground, same parallels — only the unit differs, and
    // reading a survey in the wrong one misplaces it by a factor of 3.28.
    const metres = resolveStatePlane('EPSG:26955')!
    const feet = resolveStatePlane('EPSG:2233')!
    expect(metres.def).toContain('+units=m')
    expect(feet.def).toContain('+units=us-ft')

    const m = proj4('EPSG:4326', metres.def).forward([-105.5, 38])
    const f = proj4('EPSG:4326', feet.def).forward([-105.5, 38])
    // 1 US survey foot = 1200/3937 m exactly.
    expect(f[0] * (1200 / 3937)).toBeCloseTo(m[0], 3)
    expect(f[1] * (1200 / 3937)).toBeCloseTo(m[1], 3)
  })

  it('distinguishes US survey feet from international feet', () => {
    // Arizona is published in international feet, California in US survey feet.
    // They differ by 2 ppm — 60 mm across a zone, which is a real survey error.
    expect(resolveStatePlane('EPSG:2222')?.def).toContain('+units=ft')
    expect(resolveStatePlane('EPSG:2225')?.def).toContain('+units=us-ft')
  })
})

describe('crs-stateplane · reachable through the normal CRS lookup', () => {
  it('resolveCrs finds a State Plane code without any pasting', () => {
    const res = resolveCrs('EPSG:2913')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.note).toContain('Oregon North')
  })

  it('accepts the spellings IfcProjectedCRS actually contains', () => {
    for (const spelling of ['EPSG:2913', '2913', 'urn:ogc:def:crs:EPSG::2913']) {
      expect(resolveCrs(spelling).ok, spelling).toBe(true)
    }
  })

  it('still reports genuinely unknown codes as unknown', () => {
    expect(resolveCrs('EPSG:999999').ok).toBe(false)
  })

  it('round-trips a real Oregon site, in the feet the zone is published in', () => {
    // End-to-end through the same functions the aligner uses. Oregon North's
    // central meridian is 120.5°W and its false easting is 2 500 000 METRES
    // while its coordinates are expressed in international FEET — a combination
    // that reads like a typo and is genuinely what EPSG:2913 says.
    const res = resolveCrs('EPSG:2913')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const site = { lat: 44.5646, lon: -123.2620 }        // Corvallis, Oregon
    const grid = wgs84ToGrid(res.value, site.lat, site.lon)
    expect(grid.ok).toBe(true)
    if (!grid.ok) return

    // On the central meridian the easting is exactly the false easting, in feet.
    const onMeridian = wgs84ToGrid(res.value, 44.5, -120.5)
    expect(onMeridian.ok).toBe(true)
    if (onMeridian.ok) {
      expect(onMeridian.value.eastings).toBeCloseTo(2_500_000.0001424 / 0.3048, 2)
    }

    const back = gridToWgs84(res.value, grid.value.eastings, grid.value.northings)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.value.lat).toBeCloseTo(site.lat, 8)
    expect(back.value.lon).toBeCloseTo(site.lon, 8)
    expect(back.value.inDomain).toBe(true)
  })
})
