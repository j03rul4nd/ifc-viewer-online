import { describe, expect, it } from 'vitest'
import { errorKindOf } from './analytics'

describe('errorKindOf', () => {
  it('maps known failure texts to fixed tokens', () => {
    expect(errorKindOf('RangeError: Array buffer allocation failed')).toBe('oom')
    expect(errorKindOf('RangeError: Invalid array length')).toBe('array-length')
    expect(errorKindOf('RuntimeError: unreachable')).toBe('wasm-unreachable')
    expect(errorKindOf('Aborted(). Build with -sASSERTIONS')).toBe('wasm-abort')
    expect(errorKindOf('WebGL CONTEXT_LOST_WEBGL')).toBe('gpu-lost')
    expect(errorKindOf("TypeError: Cannot read properties of undefined (reading 'x')")).toBe('type-error')
  })
  it('never echoes the raw message', () => {
    expect(errorKindOf('Failed to load secret-project-tower.ifc')).toBe('other')
  })
})
