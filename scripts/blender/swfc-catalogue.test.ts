// @vitest-environment node
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_MODELS } from '../../src/demo-models/models'

describe('Shanghai World Financial Center published reference', () => {
  it('offers a locally bundled, correctly sized and attributed IFC', () => {
    const model = DEMO_MODELS.find(m => m.id === 'shanghai-world-financial-center')!
    expect(model).toBeDefined()
    expect(model.sizeBytes).toBe(statSync(resolve('public/models/swfc', model.fileName)).size)
    expect(model.description).toContain('not an as-built')
    expect(model.sourceLabel).toContain('KPF / ECADI')
    expect(model.ifcUrl).toContain('?v=20260906-r1')
  })
  it('ships IFC4 with the published above-ground and basement hierarchy', () => {
    const ifc = readFileSync(resolve('public/models/swfc/SHA-IVO-SWFC-A-0001.ifc'), 'utf8')
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'))")
    expect(ifc.match(/=IFCBUILDINGSTOREY\(/g)).toHaveLength(104)
    expect(ifc).toContain('ReferenceModelEvidence')
    expect(ifc).not.toContain('\r')
    const validation = JSON.parse(readFileSync(resolve('public/models/swfc/validation.json'), 'utf8'))
    expect(validation.expressErrors).toBe(0)
  })
})
