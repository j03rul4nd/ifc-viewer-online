import { describe, expect, it } from 'vitest'
import { crossKind } from './anchors'
import type { Anchor, MeasureItem } from '../../lib/measure/measure-types'

const P = { x: 0, y: 0, z: 0 }
const item = (anchors: (Anchor | null)[]): MeasureItem => ({
  id: 'm', seq: 1, name: null, visible: true, kind: 'angle', value: 0, points: [P, P], anchors,
})
const arc: Anchor = { model: 'ARC.ifc' }
const str: Anchor = { model: 'STR.ifc' }
const tower: Anchor = { map: { kind: 'building', id: 'w1' } }
const terrain: Anchor = { map: { kind: 'terrain' } }

describe('crossKind', () => {
  it('names what the two ends stand on', () => {
    expect(crossKind(item([arc, str]))).toBe('models')
    expect(crossKind(item([arc, tower]))).toBe('modelMap')
    expect(crossKind(item([terrain, arc]))).toBe('modelMap')
    expect(crossKind(item([tower, terrain]))).toBe('map')
  })

  it('has no tag when both ends are on the same thing, or one is unknown', () => {
    expect(crossKind(item([arc, arc]))).toBeNull()
    expect(crossKind(item([tower, tower]))).toBeNull()
    expect(crossKind(item([arc, null]))).toBeNull()
    expect(crossKind(item([]))).toBeNull()
  })
})
