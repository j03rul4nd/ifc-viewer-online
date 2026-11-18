import { describe, it, expect } from 'vitest'
import { isFederationFileName, splitFederationDrop } from './federation-drop'

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
