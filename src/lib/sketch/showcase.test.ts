// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isSketchDoc, parseDoc, serializeDoc } from './document'
import { SHOWCASES, type ShowcaseId } from './showcase'

describe('showcase drawings', () => {
  for (const id of Object.keys(SHOWCASES) as ShowcaseId[]) {
    it(`${id} is an ordinary document, the same every run`, () => {
      const { doc } = SHOWCASES[id]()
      expect(isSketchDoc(doc)).toBe(true)
      expect(parseDoc(serializeDoc(doc))).not.toBeNull()
      const count = doc.pages[0].layers.reduce((n, l) => n + l.strokes.length, 0)
      expect(count).toBeGreaterThan(100)
      for (const stroke of doc.pages[0].layers.flatMap((l) => l.strokes)) expect(stroke.points.every(Number.isFinite)).toBe(true)
      const points = (d: typeof doc) => d.pages[0].layers.flatMap((l) => l.strokes.map((s) => [...s.points]))
      expect(points(SHOWCASES[id]().doc)).toEqual(points(doc))
    })
  }
})
