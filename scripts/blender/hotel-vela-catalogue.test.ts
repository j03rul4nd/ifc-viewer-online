import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'
import path from 'node:path'
import { demoSets } from '../../src/demo-models/models'

describe('Hotel Vela download metadata', () => {
  const sets = demoSets()
  it('versions the replacement Hotel Vela files and reports their actual download sizes', () => {
    const vela = sets.find(s => s.id === 'hotel-vela')!
    const revisions = new Set<string>()
    for (const model of vela.models) {
      const url = new URL(model.ifcUrl, 'https://example.test')
      const revision = url.searchParams.get('v')
      expect(revision).toBeTruthy()
      revisions.add(revision!)
      expect(statSync(path.join(process.cwd(), 'public', url.pathname)).size).toBe(model.sizeBytes)
    }
    expect(revisions.size).toBe(1)
  })

})
