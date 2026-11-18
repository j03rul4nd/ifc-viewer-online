import { describe, it, expect } from 'vitest'
import { isFederationFileName, splitFederationDrop, openDroppedFederation } from './federation-drop'

describe('openDroppedFederation', () => {
  const f = (name: string) => ({ name })
  it('an invalid manifest still loads the IFCs dropped with it', async () => {
    const loaded: string[] = []
    const split = splitFederationDrop([f('bad.ifcfed.json'), f('a.ifc'), f('b.ifc')])
    const r = await openDroppedFederation(split, async () => 'invalid', (ifcs) => { loaded.push(...ifcs.map((x) => x.name)) })
    expect(r).toBe('invalid')
    expect(loaded).toEqual(['a.ifc', 'b.ifc'])
  })

  it('a valid manifest takes the IFCs for the restore and loads nothing else', async () => {
    const loaded: string[] = []
    const seen: string[] = []
    const split = splitFederationDrop([f('ok.ifcfed.json'), f('a.ifc')])
    const r = await openDroppedFederation(split, async (_m, ifcs) => { seen.push(...ifcs.map((x) => x.name)); return 'restored' }, (ifcs) => { loaded.push(...ifcs.map((x) => x.name)) })
    expect(r).toBe('restored')
    expect(seen).toEqual(['a.ifc'])
    expect(loaded).toEqual([])
  })
})

const f = (name: string) => ({ name })

describe('federation drop', () => {
  it('recognises .ifcfed.json case-insensitively, not plain json or ifc', () => {
    expect(isFederationFileName('Torre.ifcfed.json')).toBe(true)
    expect(isFederationFileName('X.IFCFED.JSON ')).toBe(true)
    expect(isFederationFileName('data.json')).toBe(false)
    expect(isFederationFileName('a.ifc')).toBe(false)
  })

  it('no manifest: nothing intercepted', () => {
    const r = splitFederationDrop([f('a.ifc'), f('b.las')])
    expect(r.manifest).toBeNull()
  })

  it('manifest with IFCs: IFCs go to the restore, the rest is routed', () => {
    const r = splitFederationDrop([f('a.ifc'), f('set.ifcfed.json'), f('B.IFC'), f('scan.las'), f('other.ifcfed.json')])
    expect(r.manifest?.name).toBe('set.ifcfed.json')
    expect(r.ifcs.map((x) => x.name)).toEqual(['a.ifc', 'B.IFC'])
    expect(r.rest.map((x) => x.name)).toEqual(['scan.las'])
  })
})
