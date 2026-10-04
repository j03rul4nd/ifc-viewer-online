import { describe, it, expect } from 'vitest'
import { averageDaylightFactor, thetaFromSkyView, assignWindows, roomDaylight, daylightTargets, type SpaceInfo, type DaylightWindow } from './daylight'

// A 5 m wide × 4 m deep × 2.7 m room, window on its south wall (+z).
const room: SpaceInfo = { key: 's1', label: 'Living', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 2.7, z: 4 } } }
const win = (o: Partial<DaylightWindow> = {}): DaylightWindow => ({
  key: 'w1', label: 'window #1', center: { x: 2.5, y: 1.5, z: 4.05 }, n: { x: 0, z: 1 }, width: 2, height: 1.5, skyView: 0.5, glassShare: 0.8, ...o,
})

describe('daylight', () => {
  it('BRE formula: textbook numbers', () => {
    // T 0.7, 3 m² of glass, θ 80°, 100 m² of surfaces, R 0.5 → 0.7·3·80 / (100·0.75) = 2.24 %
    expect(averageDaylightFactor(0.7, 3, 80, 100, 0.5)).toBeCloseTo(2.24, 2)
    expect(thetaFromSkyView(0.5)).toBe(90)
    expect(thetaFromSkyView(0.25)).toBe(45)
  })

  it('a window goes to the room whose wall it sits on, facing out — not to the neighbour behind it', () => {
    const next: SpaceInfo = { key: 's2', label: 'Next', box: { min: { x: 0, y: 0, z: 4.2 }, max: { x: 5, y: 2.7, z: 8 } } }
    const m = assignWindows([room, next], [win()])
    expect(m.get('s1')?.length).toBe(1)
    expect(m.get('s2')).toBeUndefined()
    // Another storey: no.
    expect(assignWindows([room], [win({ center: { x: 2.5, y: 5, z: 4.05 } })]).size).toBe(0)
  })

  it('room DF, level and limiting depth', () => {
    const targets = { minimum: 1.5, medium: 2.5, high: 3.8 }
    const [r] = roomDaylight([room], [win()], targets)
    // Aw = 2·1.5·0.8 = 2.4, θ 90, A = 2(20 + 13.5 + 10.8) = 88.6
    expect(r.glazedArea).toBeCloseTo(2.4, 6)
    expect(r.df).toBeCloseTo((0.68 * 2.4 * 90) / (88.6 * 0.75), 3)
    expect(r.level).toBe('minimum')
    expect(r.depth).toBe(4)
    // 2/(1−0.5) / (1/5 + 1/2.7) ≈ 7.0 m: a 4 m room is fine.
    expect(r.depthLimit).toBeGreaterThan(6.9)
    // Obstructed outside (sky view 0.2): darker.
    expect(roomDaylight([room], [win({ skyView: 0.2 })], targets)[0].df).toBeLessThan(r.df * 0.5)
    expect(roomDaylight([room], [], targets)[0]).toMatchObject({ df: 0, level: 'none', windows: 0 })
  })

  it('targets from the median diffuse illuminance', () => {
    const t = daylightTargets([{ dhi: 100, hours: 1 }, { dhi: 150, hours: 2 }, { dhi: 300, hours: 1 }])
    expect(t.medianLux).toBe(150 * 120)
    expect(t.minimum).toBeCloseTo((300 / 18000) * 100, 6)
    expect(t.high).toBeCloseTo(t.minimum * 2.5, 6)
  })
})
