import { describe, it, expect } from 'vitest'
import { paintTwinLabels } from './label-paint'

/** A 2D context that records what was drawn (no canvas in the test runner). */
function fakeCtx() {
  const calls: Array<{ op: string; args: unknown[]; fill?: string }> = []
  const ctx = {
    font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() {}, restore() {}, beginPath() {}, stroke() {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    roundRect: (...args: unknown[]) => calls.push({ op: 'roundRect', args }),
    arc: (...args: unknown[]) => calls.push({ op: 'arc', args }),
    fill() { calls.push({ op: 'fill', args: [], fill: String(ctx.fillStyle) }) },
    fillText: (...args: unknown[]) => calls.push({ op: 'fillText', args }),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx }
}

describe('paintTwinLabels', () => {
  it('draws a pill with the rule colour dot and the value, at device-pixel scale', () => {
    const { ctx, calls, raw } = fakeCtx()
    const drew = paintTwinLabels(ctx, 800, 600, 2, [{ x: 100, y: 200, text: '21.4', color: '#ef4444' }])
    expect(drew).toBe(true)
    expect(raw.font).toContain('20px') // 10 CSS px × 2
    const pill = calls.find((c) => c.op === 'roundRect')!.args as number[]
    // Bottom-centre anchored at (100, 200) CSS px, lifted 4 px, scaled ×2.
    expect(pill[1] + pill[3]).toBe(200 * 2 - 4 * 2)
    expect(pill[0] + pill[2] / 2).toBeCloseTo(100 * 2)
    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toContain('#ef4444')
    expect(calls.find((c) => c.op === 'fillText')!.args[0]).toBe('21.4')
  })

  it('skips pills entirely outside the frame and reports nothing drawn', () => {
    const { ctx, calls } = fakeCtx()
    expect(paintTwinLabels(ctx, 800, 600, 1, [{ x: -500, y: 300, text: '1', color: null }, { x: 400, y: -50, text: '2', color: null }])).toBe(false)
    expect(calls.filter((c) => c.op === 'fillText')).toHaveLength(0)
  })
})

describe('declutter', () => {
  it('keeps the first of overlapping labels, all of separated ones, none invisible', async () => {
    const { declutter } = await import('./label-paint')
    const keep = declutter([
      { x: 100, y: 100, visible: true, text: '21.4' },
      { x: 104, y: 102, visible: true, text: '22.0' }, // on top of the first
      { x: 300, y: 100, visible: true, text: '19.5' }, // far away
      { x: 500, y: 100, visible: false, text: '18' },  // behind the camera
      { x: Number.NaN, y: 0, visible: true, text: 'x' },
    ])
    expect(keep).toEqual([true, false, true, false, false])
  })

  it('stacked vertically with room for the pill: both stay', async () => {
    const { declutter } = await import('./label-paint')
    expect(declutter([{ x: 100, y: 100, visible: true, text: '1' }, { x: 100, y: 125, visible: true, text: '2' }])).toEqual([true, true])
  })
})
