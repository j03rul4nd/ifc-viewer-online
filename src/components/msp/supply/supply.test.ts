import { describe, it, expect } from 'vitest'
import { createTracker, advance, stageOf, progressOf, pointAt, trackKpis, agentUpdate } from './supply'

describe('import tracker sim', () => {
  it('moves orders through every stage and raises delays', () => {
    const t = createTracker(21)
    const seen = new Set<string>()
    for (let i = 0; i < 24 * 120; i++) {
      advance(t, 1)
      for (const s of t.shipments) {
        seen.add(stageOf(t, s))
        const f = progressOf(t, s)
        expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1)
        const p = pointAt(s.route, f).at
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
      }
    }
    for (const st of ['production', 'qc', 'toOrigin', 'mainLeg', 'customs', 'lastMile', 'delivered']) expect(seen.has(st)).toBe(true)
    expect(t.events.some((e) => e.level === 'warn' || e.level === 'alert')).toBe(true)
    expect(trackKpis(t).avgDoorToDoorD).toBeGreaterThan(3)
    expect((agentUpdate(t, t.shipments[0]) as { order: string }).order).toBe(t.shipments[0].id)
  })
})
