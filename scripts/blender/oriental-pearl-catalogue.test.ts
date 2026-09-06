// @vitest-environment node
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_MODELS } from '../../src/demo-models/models'

describe('Oriental Pearl reference example', () => {
  it('ships the correct bytes and approximate-model disclosure', () => {
    const model = DEMO_MODELS.find(m => m.id === 'oriental-pearl-tower')!
    expect(model).toBeDefined()
    expect(model.sizeBytes).toBe(statSync(resolve('public/models/oriental-pearl', model.fileName)).size)
    expect(model.description).toContain('Approximate reconstruction')
    expect(model.ifcUrl).toContain('?v=20260906-r2')
    expect(model.sourceLabel).toContain('Jiang Huancheng')
  })
  it('preserves functional levels and does not invent occupied antenna floors', () => {
    const ifc = readFileSync(resolve('public/models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc'), 'utf8')
    expect(ifc.match(/=IFCBUILDINGSTOREY\(/g)).toHaveLength(25)
    expect(ifc.match(/=IFCSPACE\(/g)).toHaveLength(25)
    expect(ifc).toContain('ReferenceModelEvidence')
    expect(ifc).toContain('Transparent observatory')
    expect(ifc).toContain('Revolving restaurant')
    expect(ifc).not.toContain('\r')
    const report = JSON.parse(readFileSync(resolve('public/models/oriental-pearl/validation.json'), 'utf8'))
    expect(report.expressErrors).toBe(0)
  })
})
