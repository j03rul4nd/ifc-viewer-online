import { describe, it, expect } from 'vitest'
import { FragmentsModels } from '@thatopen/fragments'
import { fragmentsWorkerOptions } from './platform'

describe('fragmentsWorkerOptions', () => {
  it('leaves fragments its default pool off WebKit', () => {
    expect(fragmentsWorkerOptions(false)).toBeUndefined()
  })

  it('gives the default pool exactly one worker on WebKit, in a shape fragments accepts', () => {
    const opts = fragmentsWorkerOptions(true)!
    const reserved = Object.values(opts.threadGroups).reduce((a, b) => a + b, 0)
    expect(opts.maxWorkers - reserved).toBe(1)
    // fragments validates these in its constructor (maxWorkers ≥ 2, a slot
    // left for the default pool); building one spawns no worker.
    const models = new FragmentsModels('worker.mjs', opts)
    expect(models).toBeTruthy()
  })
})
