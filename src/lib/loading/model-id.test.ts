// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { mintModelId, resetModelIdClock } from './model-id'

// The shape `fileNameFromModelId` (spatial-tree.ts) relies on.
const SHAPE = /-\d{13,}$/

describe('mintModelId', () => {
  beforeEach(() => { resetModelIdClock() })

  it('keeps the `${fileName}-${13-digit ms}` shape', () => {
    const id = mintModelId('Hotel_Vela-ARC.ifc', 1_726_000_000_000)
    expect(id).toBe('Hotel_Vela-ARC.ifc-1726000000000')
    expect(id).toMatch(SHAPE)
    expect(id.replace(SHAPE, '')).toBe('Hotel_Vela-ARC.ifc')
    expect(mintModelId('a.ifc')).toMatch(SHAPE)
  })

  it('is unique for the same file in the same millisecond', () => {
    const t = 1_726_000_000_000
    const ids = Array.from({ length: 50 }, () => mintModelId('same.ifc', t))
    expect(new Set(ids).size).toBe(50)
    for (const id of ids) expect(id).toMatch(SHAPE)
  })

  it('is strictly increasing even if the clock goes backwards', () => {
    const a = mintModelId('x.ifc', 1_726_000_000_500)
    const b = mintModelId('x.ifc', 1_726_000_000_100)
    const stamp = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1))
    expect(stamp(b)).toBeGreaterThan(stamp(a))
  })

  it('resetModelIdClock forgets the last stamp', () => {
    mintModelId('x.ifc', 1_726_000_000_900)
    resetModelIdClock()
    expect(mintModelId('x.ifc', 1_726_000_000_000)).toBe('x.ifc-1726000000000')
  })
})
