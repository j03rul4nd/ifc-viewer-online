// The steel demo model: the committed file is what the generator writes (same
// bytes, so it stays in step), it is small, and the takeoff reader sees the
// parts and profiles the guided tour talks about.
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { generateSteelHall, FRAMES } from './generate'
import { readStep } from '../../src/lib/autofix/step'
import { geometryFromStepFile } from '../../src/lib/steel/profiles'

const FILE = join(__dirname, '..', '..', 'public', 'models', 'steel-demo', 'steel-hall.ifc')
const text = generateSteelHall()
const step = readStep(text)
const count = (type: string): number => [...step.entities.values()].filter((e) => e.type === type).length

describe('steel demo model', () => {
  it('is deterministic and matches the committed file', () => {
    expect(generateSteelHall()).toBe(text)
    expect(readFileSync(FILE, 'latin1')).toBe(text)
  })

  it('stays under 2 MB', () => {
    expect(statSync(FILE).size).toBeLessThan(2 * 1024 * 1024)
  })

  it('is IFC4 in millimetres with S355', () => {
    expect(text).toContain("FILE_SCHEMA(('IFC4'))")
    expect(text).toContain('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)')
    expect(text).toContain("IFCMATERIAL('S355'")
  })

  it('has the parts of a 9-frame portal hall', () => {
    expect(FRAMES).toBe(9)
    expect(count('IFCCOLUMN')).toBe(18)
    expect(count('IFCBEAM')).toBe(18)
    expect(count('IFCPLATE')).toBe(18)
    expect(count('IFCMECHANICALFASTENER')).toBe(72)
    expect(count('IFCELEMENTASSEMBLY')).toBe(9)
    // 64 purlins + 32 side rails + 8 braces
    expect(count('IFCMEMBER')).toBe(104)
  })

  it('gives the takeoff reader at least five profiles from the geometry', () => {
    const geo = geometryFromStepFile(step)
    const profiles = new Set([...geo.values()].map((g) => g.profile))
    expect([...profiles].sort()).toEqual(['HEA300', 'IPE160', 'IPE400', 'L80x8', 'PL20x400', 'UPE160'])
    const col = [...geo.values()].find((g) => g.profile === 'HEA300')!
    expect(col.length).toBeCloseTo(6, 5)
  })

  it('leaves some parts without Qto so the source chain shows', () => {
    const qtoOwners = (text.match(/IFCELEMENTQUANTITY\(/g) ?? []).length
    const parts = count('IFCCOLUMN') + count('IFCBEAM') + count('IFCMEMBER') + count('IFCPLATE')
    expect(qtoOwners).toBeGreaterThan(parts / 2)
    expect(qtoOwners).toBeLessThan(parts)
  })

  it('opens in web-ifc and every linear part and plate has a mesh', async () => {
    const api = new IfcAPI()
    api.SetWasmPath(join(process.cwd(), 'node_modules', 'web-ifc') + sep, true)
    await api.Init()
    const id = api.OpenModel(new TextEncoder().encode(text))
    const meshed = new Set<number>()
    api.StreamAllMeshes(id, (m) => { meshed.add(m.expressID) })
    api.CloseModel(id)
    // 18 columns + 18 rafters + 104 members + 18 plates
    expect(meshed.size).toBe(158)
  }, 30000)
})
