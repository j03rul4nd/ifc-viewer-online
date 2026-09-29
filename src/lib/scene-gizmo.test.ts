import { describe, it, expect } from 'vitest'
import { wrapDeltaDeg } from './scene-gizmo'

describe('wrapDeltaDeg', () => {
  it('is the plain difference for small steps', () => {
    expect(wrapDeltaDeg(30, 10)).toBe(20)
    expect(wrapDeltaDeg(-5, 5)).toBe(-10)
  })

  it('takes the short way across the ±180 seam, so a drag past it keeps accumulating', () => {
    expect(wrapDeltaDeg(-179, 179)).toBe(2)
    expect(wrapDeltaDeg(179, -179)).toBe(-2)
  })

  it('stays in (−180, 180]', () => {
    expect(wrapDeltaDeg(180, 0)).toBe(180)
    expect(wrapDeltaDeg(0, 180)).toBe(180)
  })
})
