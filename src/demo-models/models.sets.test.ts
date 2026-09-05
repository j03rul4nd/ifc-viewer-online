// ─── demo sets ────────────────────────────────────────────────────────────────
// A federated project is one demo that happens to be several files. These pin
// the grouping, because the failure mode is silent and annoying: a set that
// half-groups leaves one discipline stranded as its own card, and the reader
// loads an envelope with no structure in it and concludes the viewer is broken.

import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'
import path from 'node:path'
import { DEMO_MODELS, demoSets, sortedDemoModels } from './models'

describe('demoSets', () => {
  const sets = demoSets()

  it('accounts for every model exactly once', () => {
    const grouped = sets.flatMap((s) => s.models.map((m) => m.id)).sort()
    const all = DEMO_MODELS.map((m) => m.id).sort()
    expect(grouped).toEqual(all)
  })

  it('groups the federated projects and leaves the rest alone', () => {
    const multi = sets.filter((s) => s.models.length > 1).map((s) => s.id).sort()
    expect(multi).toEqual(['hotel-vela', 'poblenou'])
  })

  it('gives the Hotel Vela its three disciplines, in discipline order', () => {
    const vela = sets.find((s) => s.id === 'hotel-vela')!
    expect(vela.name).toBe('Hotel Vela')
    expect(vela.models.map((m) => m.id))
      .toEqual(['hotel-vela-arc', 'hotel-vela-str', 'hotel-vela-mep'])
    // Architecture, structure, services — not alphabetical, which would put
    // services first and read as though the project began with its ductwork.
    expect(vela.models.map((m) => m.fileName)).toEqual([
      'BCN-IVO-ZZ-XX-M3-A-0002.ifc',
      'BCN-IVO-ZZ-XX-M3-S-0002.ifc',
      'BCN-IVO-ZZ-XX-M3-M-0002.ifc',
    ])
  })

  it('groups Poblenou too — the grouping is not a Hotel Vela special case', () => {
    const p = sets.find((s) => s.id === 'poblenou')!
    expect(p.models).toHaveLength(3)
    expect(p.models.map((m) => m.setOrder)).toEqual([1, 2, 3])
  })

  it('sums the set size, so the card can say what the whole download costs', () => {
    const vela = sets.find((s) => s.id === 'hotel-vela')!
    expect(vela.sizeBytes).toBe(vela.models.reduce((n, m) => n + m.sizeBytes, 0))
    expect(vela.sizeBytes).toBeGreaterThan(0)
  })

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

  it('keeps a single model as a set of one, so the gallery has one shape', () => {
    const single = sets.find((s) => s.models.length === 1)!
    expect(single.id).toBe(single.models[0].id)
    expect(single.name).toBe(single.models[0].name)
  })

  it('keeps featured sets ahead of the rest', () => {
    const firstPlain = sets.findIndex((s) => !s.featured)
    const lastFeatured = sets.map((s) => s.featured).lastIndexOf(true)
    if (firstPlain !== -1 && lastFeatured !== -1) {
      expect(lastFeatured).toBeLessThan(firstPlain)
    }
  })

  it('every set member shares one category', () => {
    for (const s of sets) {
      expect(new Set(s.models.map((m) => m.category)).size).toBe(1)
    }
  })

  it('does not disturb the flat catalogue', () => {
    expect(sortedDemoModels()).toHaveLength(DEMO_MODELS.length)
  })
})
