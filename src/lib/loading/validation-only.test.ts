import { describe, it, expect } from 'vitest'
import { canValidateWithout3d } from './validation-only'

const file = { type: 'file', file: new File(['ISO-10303-21;'], 'big.ifc') } as const

describe('canValidateWithout3d', () => {
  it('offers it when the 3D failed on a readable file', () => {
    for (const code of ['scene', 'parse', 'worker-crash', 'out-of-memory', 'gpu'] as const) {
      expect(canValidateWithout3d(code, file), code).toBe(true)
    }
  })
  it('not when the file itself is the problem, or is gone', () => {
    for (const code of ['invalid-file', 'unsupported', 'read-failed', 'network', 'http', 'cancelled'] as const) {
      expect(canValidateWithout3d(code, file), code).toBe(false)
    }
    expect(canValidateWithout3d('scene', null)).toBe(false)
  })
})
