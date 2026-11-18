import { describe, expect, it } from 'vitest'
import { contentFrameFor } from './leaflet-vector-layer'

describe('contentFrameFor', () => {
  it('uses the tile itself up to the data zoom', () => {
    expect(contentFrameFor(13, 4146, 3056)).toEqual({ cz: 13, cx: 4146, cy: 3056, k: 1, ox: -0, oy: -0 })
  })
  it('overzooms from the z14 ancestor, shifted to the right sub-square', () => {
    // z16 tile (66334, 48903) lies in z14 tile (16583, 12225), 4×4 below it.
    const f = contentFrameFor(16, 66334, 48903)
    expect(f).toMatchObject({ cz: 14, cx: 16583, cy: 12225, k: 4 })
    expect(f.ox).toBe(-2)
    expect(f.oy).toBe(-3)
  })
})
