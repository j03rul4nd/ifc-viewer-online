import { describe, expect, it } from 'vitest'
import { locateTarget, pinnableSnags } from './locate'
import { createSnag } from './snags'

describe('locateTarget', () => {
  const els = [{ modelId: 'a', expressId: 7, globalId: 'G7' }, { modelId: 'b', expressId: 9, globalId: 'G9' }]
  it('uses the express id with its model, or the fallback model', () => {
    expect(locateTarget({ modelId: 'b', expressId: 3 }, els)).toEqual({ modelId: 'b', expressId: 3 })
    expect(locateTarget({ expressId: 3 }, els, 'a')).toEqual({ modelId: 'a', expressId: 3 })
    expect(locateTarget({ expressId: 3 }, els)).toBeNull()
  })
  it('falls back to the GlobalId through the element index', () => {
    expect(locateTarget({ globalId: 'G9' }, els)).toEqual({ modelId: 'b', expressId: 9 })
    expect(locateTarget({ globalId: 'nope' }, els)).toBeNull()
  })
})

describe('pinnableSnags', () => {
  it('keeps open snags with a point or an element', () => {
    const a = createSnag({ title: 'a', location: { expressId: 1, modelId: 'm' } })
    const b = createSnag({ title: 'b', location: { point: [0, 0, 0] } })
    const c = createSnag({ title: 'c', location: { globalId: 'only' } })
    expect(pinnableSnags([a, b, c]).map((s) => s.title)).toEqual(['a', 'b'])
  })
})
