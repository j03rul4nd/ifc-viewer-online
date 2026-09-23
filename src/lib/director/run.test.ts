import { describe, expect, it } from 'vitest'
import { stagesAt } from './run'

describe('stagesAt', () => {
  it('shows the first storey from the start and all of them by 85 %', () => {
    expect(stagesAt(0, 10)).toBe(1)
    expect(stagesAt(0.425, 10)).toBe(5)
    expect(stagesAt(0.85, 10)).toBe(10)
    expect(stagesAt(1, 10)).toBe(10)
    expect(stagesAt(0.5, 0)).toBe(0)
  })
})
