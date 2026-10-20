import { describe, it, expect } from 'vitest'
import {
  createTracker, advance, stageOf, progressOf, pointAt, trackKpis, agentUpdate,
  milestones, landedCost, expediteOption, payments, containers, supplierScores,
} from './supply'

describe('import tracker sim', () => {
  it('moves orders through every stage and raises incidents', () => {
    const t = createTracker(21)
    const seen = new Set<string>()
    const all = new Set<string>()
    for (let i = 0; i < 24 * 120; i++) {
      advance(t, 1)
      for (const e of t.events.slice(0, 30)) all.add(e.text)
      for (const s of t.shipments) {
        seen.add(stageOf(t, s))
        const f = progressOf(t, s)
        expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1)
        const p = pointAt(s.route, f).at
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
      }
    }
    for (const st of ['production', 'qc', 'toOrigin', 'mainLeg', 'customs', 'lastMile', 'delivered']) expect(seen.has(st)).toBe(true)
    const texts = [...all].join(' | ')
    expect(texts).toMatch(/QC failed|re-inspection/)
    expect(texts).toMatch(/Cape of Good Hope/)
    expect(trackKpis(t).avgDoorToDoorD).toBeGreaterThan(3)
    expect((agentUpdate(t, t.shipments[0]) as { order: string }).order).toBe(t.shipments[0].id)
  })

  it('prices, dates and groups each order', () => {
    const t = createTracker(21)
    advance(t, 24 * 4)
    for (const s of t.shipments) {
      const lc = landedCost(s)
      expect(lc.totalEur).toBeGreaterThan(s.units * s.unitFobEur)
      expect(lc.perUnitEur).toBeGreaterThan(s.unitFobEur)
      expect(lc.lines.some((l) => l.label.includes(s.hs))).toBe(true)
      const ms = milestones(t, s)
      expect(ms[0].label).toMatch(/PO confirmed/)
      expect(ms[ms.length - 1].label).toMatch(/Delivered/)
      expect(payments(s, stageOf(t, s))[0].paid).toBe(true)
      expect(s.qc.sample).toBeGreaterThan(0)
    }
    const boxes = containers(t)
    expect(boxes.some((c) => c.pos.length > 1)).toBe(true) // a consolidated container
    expect(supplierScores(t)).toHaveLength(3)
    const seaEarly = t.shipments.find((s) => s.mode === 'sea' && ['production', 'qc'].includes(stageOf(t, s)))
    if (seaEarly) {
      const e = expediteOption(t, seaEarly)
      expect(e && e.extraEur > 0 && e.daysSaved > 0).toBe(true)
    }
  })
})
