import { describe, expect, it } from 'vitest'
import { countText, createTextOverlay, textRenderStateAt, WORD_STEP_SEC } from './timeline'

describe('countText', () => {
  it('scales every number and keeps its format', () => {
    expect(countText('19.241 elementos · 18 plantas', 0.5)).toBe('9.621 elementos · 9 plantas')
    expect(countText('Health Score 86/100', 0)).toBe('Health Score 0/100')
    expect(countText('4,25 m', 1)).toBe('4,25 m')
    expect(countText('1,234,567 elements', 1)).toBe('1,234,567 elements')
  })
})

describe('kinetic text', () => {
  const card = (anim: 'words' | 'slam' | 'count', text = 'One two three') =>
    createTextOverlay({ text, startSec: 0, endSec: 4, anim }, 10)

  it('words land one by one', () => {
    const c = card('words')
    expect(textRenderStateAt(c, 0)?.text).toBe('One')
    expect(textRenderStateAt(c, WORD_STEP_SEC * 1.5)?.text).toBe('One two')
    expect(textRenderStateAt(c, 2)?.text).toBe('One two three')
  })

  it('slam starts oversized and settles at 1', () => {
    const c = card('slam')
    expect(textRenderStateAt(c, 0.01)!.scale).toBeGreaterThan(1.3)
    expect(textRenderStateAt(c, 1)!.scale).toBeCloseTo(1)
  })

  it('count reaches the real numbers', () => {
    const c = card('count', '18 plantas')
    expect(textRenderStateAt(c, 0)?.text).toBe('0 plantas')
    expect(textRenderStateAt(c, 2)?.text).toBe('18 plantas')
  })
})

describe('beat punch and speed ramp', async () => {
  const { punchScale } = await import('./project')
  const { ease } = await import('./shots')

  it('punches in on the beat and settles', () => {
    const fx = { punch: { times: [1, 2], amount: 0.06 } }
    expect(punchScale(fx, 0.5)).toBe(1)
    expect(punchScale(fx, 1)).toBeCloseTo(1.06)
    expect(punchScale(fx, 1.9)).toBeCloseTo(1, 2)
    expect(punchScale(fx, 2.01)).toBeGreaterThan(1.05)
  })

  it('a speed ramp is fast at the ends and slow in the middle, and still goes 0 → 1', () => {
    const v = (x: number) => (ease('ramp', x + 0.01) - ease('ramp', x)) / 0.01
    expect(ease('ramp', 0)).toBe(0)
    expect(ease('ramp', 1)).toBeCloseTo(1)
    expect(v(0.02)).toBeGreaterThan(1.5)
    expect(v(0.5)).toBeLessThan(0.4)
    for (let x = 0; x < 1; x += 0.05) expect(ease('ramp', x + 0.05)).toBeGreaterThan(ease('ramp', x))
  })
})
