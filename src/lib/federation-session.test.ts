import { describe, it, expect } from 'vitest'
import { manifestFromSession, planRestore, federationFileName, modelCountBucket, type SessionInput } from './federation-session'
import { parseManifest, serializeManifest } from './federation-manifest'
import { reconcile } from './federation-reconcile'

const session: SessionInput = {
  id: 'f1', name: 'Hotel', now: '2026-11-18T00:00:00.000Z',
  models: [
    { id: 'a', fileName: 'C:\\work\\ARQ.ifc', fileSize: 1000, visible: true,
      transform: { position: { x: 5, y: 0, z: -2 }, rotation: { x: 0, y: 90, z: 0 }, scale: 1 }, placedByHand: true },
    { id: 'b', fileName: 'MEP.ifc', fileSize: 2000, visible: false, transform: { position: { x: 0, y: 0, z: 0 } } },
  ],
  parked: [{ id: 'p1', fileName: 'STR.ifc', fileSize: 3000 }],
  opacityById: { b: 0.3 },
  disciplineById: { a: 'A' },
  colorByDiscipline: true,
}

describe('federation-session', () => {
  it('saves a manifest parseManifest accepts, without bytes or paths', () => {
    const json = serializeManifest(manifestFromSession(session))
    const r = parseManifest(json)
    expect(r.ok).toBe(true)
    expect(json).not.toMatch(/C:|\\\\|work/)
    expect(json.length).toBeLessThan(4000)
    const m = JSON.parse(json)
    expect(m.models.map((x: { fileName: string }) => x.fileName)).toEqual(['ARQ.ifc', 'MEP.ifc', 'STR.ifc'])
    expect(m.models[1].transform).toBeUndefined()
  })

  it('round-trips transform, visibility, opacity and parked', () => {
    const r = parseManifest(serializeManifest(manifestFromSession(session)))
    if (!r.ok) throw new Error('parse')
    const files = [{ name: 'STR.ifc', size: 3000 }, { name: 'MEP.ifc', size: 2000 }, { name: 'ARQ.ifc', size: 1000 }]
    const plan = planRestore(r.value, reconcile(r.value, files))
    expect(plan.missing).toEqual([])
    expect(plan.colorByDiscipline).toBe(true)
    expect(plan.loads).toEqual([
      { refId: 'm1', fileIndex: 2, apply: { visible: true, opacity: 1, placedByHand: true, discipline: 'A',
        transform: session.models[0].transform } },
      { refId: 'm2', fileIndex: 1, apply: { visible: false, opacity: 0.3, placedByHand: false } },
    ])
    expect(plan.parks).toEqual([{ refId: 'm3', fileIndex: 0 }])
  })

  it('lists missing files and still loads the rest', () => {
    const r = parseManifest(serializeManifest(manifestFromSession(session)))
    if (!r.ok) throw new Error('parse')
    const files = [{ name: 'ARQ.ifc', size: 1000 }, { name: 'other.ifc', size: 5 }]
    const plan = planRestore(r.value, reconcile(r.value, files))
    expect(plan.loads.map((l) => l.refId)).toEqual(['m1'])
    expect(plan.missing.map((m) => m.fileName)).toEqual(['MEP.ifc', 'STR.ifc'])
    expect(plan.unassigned).toEqual([1])
  })

  it('names the file and buckets counts', () => {
    expect(federationFileName(' My/Set: v2 ')).toBe('My-Set- v2.ifcfed.json')
    expect(federationFileName('')).toBe('federation.ifcfed.json')
    expect([2, 3, 5, 6, 10, 11].map(modelCountBucket)).toEqual(['2', '3-5', '3-5', '6-10', '6-10', '11+'])
  })
})
