import { describe, expect, it } from 'vitest'
import { TOURS, WIZARD_TOURS, placeCard, tourForPath, seenTours, markSeen } from './tours'

describe('workspace tours', () => {
  it('every tour is short and every step says something', () => {
    const ids = new Set<string>()
    for (const t of TOURS) {
      expect(ids.has(t.id), t.id).toBe(false); ids.add(t.id)
      expect(t.steps.length, t.id).toBeGreaterThan(0)
      expect(t.steps.length, t.id).toBeLessThanOrEqual(7)
      for (const s of t.steps) expect(s.body.length, `${t.id}: ${s.title}`).toBeGreaterThan(20)
    }
    for (const steps of Object.values(WIZARD_TOURS)) expect(steps.length).toBeGreaterThan(0)
  })

  it('finds the tour for a page and for its sub-pages', () => {
    expect(tourForPath('billing')?.id).toBe('billing')
    expect(tourForPath('data', 'credentials')?.id).toBe('credentials')
    expect(tourForPath('projects', 'detail')?.id).toBe('project')
    expect(tourForPath('nope')).toBeUndefined()
  })

  it('places the card below, above or centred, inside the screen', () => {
    const view = { width: 1280, height: 800 }, card = { width: 340, height: 180 }
    expect(placeCard({ top: 100, left: 200, width: 300, height: 60 }, card, view)).toMatchObject({ mode: 'float', side: 'below', top: 172 })
    expect(placeCard({ top: 650, left: 200, width: 300, height: 60 }, card, view)).toMatchObject({ side: 'above', top: 458 })
    expect(placeCard(null, card, view)).toMatchObject({ side: 'center' })
    const right = placeCard({ top: 100, left: 1200, width: 70, height: 30 }, card, view)
    expect(right.mode === 'float' && right.left + card.width).toBeLessThanOrEqual(1280 - 16)
    expect(placeCard({ top: 100, left: 10, width: 50, height: 50 }, card, { width: 375, height: 812 })).toEqual({ mode: 'docked' })
  })

  it('remembers finished tours and survives broken storage', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    markSeen('billing', store)
    expect(seenTours(store).has('billing')).toBe(true)
    expect(seenTours({ getItem: () => '{oops' }).size).toBe(0)
  })
})
