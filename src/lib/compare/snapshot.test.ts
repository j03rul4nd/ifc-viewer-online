// @vitest-environment node
// Real-file check of the snapshot + diff pipeline: the reference Poblenou
// architecture model against a copy edited the way a new export would differ.
import { describe, it, expect, beforeAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { buildSnapshot } from './snapshot'
import { diffSnapshotSets } from './model-diff'
import type { ModelSnapshot } from './types'
import POBLENOU_ARQ from '../../../public/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc?raw'

let api: IfcAPI
beforeAll(async () => { api = new IfcAPI(); await api.Init() })

async function snapshotOf(text: string, name: string): Promise<ModelSnapshot> {
  const id = api.OpenModel(new TextEncoder().encode(text))
  try {
    return await buildSnapshot(api, id, { id: name, fileName: name, sourceBytes: text.length, geometry: true })
  } finally { api.CloseModel(id) }
}

describe('snapshot of a real IFC', () => {
  const base = POBLENOU_ARQ
  // Two edits a new export would carry: a renamed element, and one GlobalId
  // swapped (to the diff: one element deleted and another created).
  const head = base
    .replace("'Core Wall South - Ground'", "'Core Wall South - Ground (rev)'")
    .replace("'3QBfMQMe9J39KjGHm4gOtE'", "'0000000000000000000NEW'")

  it('captures elements with GlobalIds, storeys and geometry fingerprints', async () => {
    const s = await snapshotOf(base, 'A.ifc')
    expect(s.elements.length).toBeGreaterThan(20)
    expect(s.projectGid).toMatch(/^[0-9A-Za-z_$]{22}$/)
    const wall = s.elements.find((e) => e.globalId === '3JuihKn1nPU9lDjMfem9TT')!
    expect(wall.storey).toBeTruthy()
    expect(wall.geo?.h).toMatch(/^[0-9a-f]{8}$/)
  }, 60_000)

  it('the same file twice diffs to nothing (fingerprints are stable)', async () => {
    const a = await snapshotOf(base, 'A.ifc')
    const b = await snapshotOf(base, 'A.ifc')
    const d = diffSnapshotSets([a], [b])
    expect(d.counts.added + d.counts.removed + d.counts.modified).toBe(0)
  }, 60_000)

  it('finds exactly the edits', async () => {
    const d = diffSnapshotSets([await snapshotOf(base, 'A_v1.ifc')], [await snapshotOf(head, 'A_v2.ifc')])
    expect(d.counts.added).toBe(1)
    expect(d.counts.removed).toBe(1)
    expect(d.counts.modified).toBe(1)
    const mod = d.elements.find((e) => e.status === 'modified')!
    expect(mod.globalId).toBe('3JuihKn1nPU9lDjMfem9TT')
    expect(mod.changes.map((c) => c.category)).toEqual(['name'])
  }, 60_000)
})
