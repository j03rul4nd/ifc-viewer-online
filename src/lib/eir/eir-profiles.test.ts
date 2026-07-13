// ─── eir-profiles.test.ts ─────────────────────────────────────────────────────
// F2-PROFILES recipe gates for the packaged SIMBA 2.1 starter profile:
//   ✅ compile test green (profile → IdsDocument → runs on the shared engine)
//   ✅ one documented model shape that PASSES and one that FAILS the profile
// The pass/fail pair runs through the REAL IDS engine (validateElements), the
// same path the app takes — synthetic elements shaped like ids-gather output.

import { describe, it, expect } from 'vitest'
import type { IdsElement } from '../ids/ids-types'
import { BUILTIN_EIR_PROFILES } from './eir-profiles'
import { compileEirToIds } from './eir-compiler'
import { validateElements } from './index'

const simba = BUILTIN_EIR_PROFILES.find((p) => p.id === 'builtin-simba21-general')!

let idSeq = 0
function el(
  ifcClass: string,
  attributes: IdsElement['attributes'] = {},
  psets: IdsElement['psets'] = {},
): IdsElement {
  return { expressId: ++idSeq, ifcClass: ifcClass.toUpperCase(), attributes, psets }
}

describe('builtin-simba21-general (Statsbygg SIMBA 2.1 starter)', () => {
  it('is registered and cites its official source', () => {
    expect(simba).toBeDefined()
    expect(simba.description).toContain('SIMBA 2.1')
    expect(simba.description).toContain('2022-07-01')
    // Every rule message cites its requirement row in the source document.
    for (const rule of simba.rules) expect(rule.message).toMatch(/^G\d+ —/)
  })

  it('compiles to one IDS specification per rule (none dropped)', () => {
    const doc = compileEirToIds(simba)
    expect(doc.specifications).toHaveLength(simba.rules.length)
  })

  // Documented PASSING model shape: complete spatial structure (storey +
  // space), every checked object carries a Name, the space also a LongName —
  // i.e. a model authored to SIMBA G18/G20.
  it('a compliant model passes with score 100', () => {
    const model = [
      el('IfcBuildingStorey', { Name: 'Plan 01' }),
      el('IfcSpace', { Name: 'A101', LongName: 'Kontor' }),
      el('IfcWall', { Name: 'Yttervegg 01' }),
      el('IfcSlab', { Name: 'Dekke 01' }),
      el('IfcDoor', { Name: 'Dør 101' }),
      el('IfcWindow', { Name: 'Vindu 101' }),
    ]
    const result = validateElements(model, simba)
    expect(result.failedSpecs).toBe(0)
    expect(result.score).toBe(100)
  })

  // Documented FAILING model shape: geometry-only export — no spaces at all
  // (G20) and unnamed elements (G18). Mirrors the "rene geometriske
  // 3D-modeller" the source explicitly says do NOT fulfil the requirement (G1).
  it('a geometry-only model fails G20 (no spaces) and G18 (unnamed objects)', () => {
    const model = [
      el('IfcBuildingStorey', { Name: 'Plan 01' }),
      el('IfcWall', { Name: '' }), // unnamed → G18
      el('IfcDoor', {}), // no Name attribute at all → G18
    ]
    const result = validateElements(model, simba)
    expect(result.failedSpecs).toBeGreaterThanOrEqual(3) // sb2 (no IfcSpace) + sb3 + sb5
    expect(result.score).toBeLessThan(100)
  })
})
