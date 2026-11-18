import { describe, expect, it } from 'vitest'
import { setupStepOf, tagSetupError } from './setup-step'

describe('setup step tagging', () => {
  it('tags an Error once, keeping its code and name', () => {
    const err = Object.assign(new RangeError('boom'), { code: 'out-of-memory' })
    const tagged = tagSetupError(tagSetupError(err, 'items'), 'paint') as Error & { code?: string }
    expect(tagged.message).toBe('boom [setup:items]')
    expect(tagged.name).toBe('RangeError')
    expect(tagged.code).toBe('out-of-memory')
  })
  it('wraps a string rejection from the fragments worker', () => {
    expect((tagSetupError('worker died', 'categories') as Error).message).toBe('worker died [setup:categories]')
  })
  it('leaves cancellations alone', () => {
    const abort = new DOMException('cancelled', 'AbortError')
    expect(tagSetupError(abort, 'items')).toBe(abort)
  })
  it('only lets allowlisted steps reach analytics', () => {
    expect(setupStepOf('x [setup:paint]')).toBe('paint')
    expect(setupStepOf('x [setup:secretfile]')).toBeUndefined()
    expect(setupStepOf('plain message')).toBeUndefined()
  })
})
