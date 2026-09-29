import { describe, expect, it } from 'vitest'
import { clearLine, interiorKeyframes, interiorStorey, planHud, typicalStoreys, type Box, type Subject } from './plan'
import { cutYAt, hudMarkAt, hudMetaAt } from '../capture/hud'
import { rollOffset } from '../capture/timeline'
import { LOOKS } from './looks'

const box = (y0: number, y1: number, x0 = -10, x1 = 10): Box => ({ min: { x: x0, y: y0, z: -5 }, max: { x: x1, y: y1, z: 5 } })
const storey = (i: number, count = 100, extra: Partial<Subject> = {}): Subject => ({ key: `s${i}`, label: `L${i}`, count, modelId: 'm', ids: [i], box: box(i * 4, i * 4 + 4), ...extra })

describe('typical storeys', () => {
  it('leaves out a near-empty foundation and the roof slab', () => {
    const list = [storey(0, 4), storey(1), storey(2), storey(3), storey(4), storey(5, 3)]
    expect(typicalStoreys(list).map((s) => s.label)).toEqual(['L2', 'L3'])
  })
  it('prefers a storey with a room for the interior', () => {
    const list = [storey(0), storey(1), storey(2, 100, { room: box(8, 12) }), storey(3), storey(4)]
    expect(interiorStorey(list)?.label).toBe('L2')
  })
})

describe('interior route', () => {
  const room = box(0, 3, 0, 40)
  it('keeps the eye at eye height and walks along the long side', () => {
    const k = interiorKeyframes(room, 1.6)
    expect(k.every((p) => p.position.y === 1.6)).toBe(true)
    expect(k[3].position.x).toBeGreaterThan(k[0].position.x)
  })
  it('steps aside from a column on the centre line', () => {
    const column = { min: { x: 8, y: 0, z: -0.3 }, max: { x: 8.6, y: 3, z: 0.3 } }
    const at = (f: number, side: number) => ({ x: 40 * f, y: 1.6, z: side })
    const side = clearLine([column], at, 10, 1.6)
    expect(side).not.toBe(0)
    for (const p of interiorKeyframes(room, 1.6, [column])) expect(Math.abs(p.position.z)).toBeGreaterThan(0.8)
  })
})

describe('HUD', () => {
  it('prints a moving cut live, relative to the ground', () => {
    const shots = [
      { section: 'hero', shot: { durationSec: 4 }, label: 'Tower', scene: {} },
      { section: 'sectionCut', shot: { durationSec: 4 }, label: 'Tower', scene: { cut: { normal: { x: 0, y: -1, z: 0 }, points: [{ x: 0, y: 30, z: 0 }, { x: 0, y: 10, z: 0 }], stepped: false } } },
    ] as never
    const model = { bounds: { center: { x: 0, y: 12, z: 0 }, size: { x: 1, y: 24, z: 1 } }, name: 'Tower' } as never
    const hud = planHud(shots, [0, 4], 0, 8, 'Tower', model, LOOKS.native, false)
    expect(hud.marks).toHaveLength(2)
    const at = hudMarkAt(hud, 6)!
    expect(at.index).toBe(1)
    expect(hudMetaAt(at.mark, 6)).toBe('+20.00 m')
    expect(cutYAt([30, 10], 1, false)).toBe(10)
  })
  it('stops where the end card starts', () => {
    const shots = [
      { section: 'hero', shot: { durationSec: 4 }, label: 'A', scene: {} },
      { section: 'endCard', shot: { durationSec: 2 }, label: 'A', scene: {}, card: { title: 'A' } },
    ] as never
    const model = { bounds: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }, name: 'A' } as never
    expect(planHud(shots, [0, 4], 0, 6, 'A', model, LOOKS.native, false).durationSec).toBe(4)
  })
})

describe('roll', () => {
  it('rolls each letter in from below, later letters later, and out the top', () => {
    expect(rollOffset(0, 0, 5)).toBe(1)
    expect(rollOffset(0, 1, 5)).toBe(0)
    expect(rollOffset(10, 0.2, 5)).toBeGreaterThan(rollOffset(0, 0.2, 5))
    expect(rollOffset(0, 5, 0)).toBe(-1)
  })
})
