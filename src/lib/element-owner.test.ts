// ─── element-owner tests ──────────────────────────────────────────────────────
// Two models that both number an element #10 — the normal case in a federated
// set, since every IFC counts from #1. Each test asks which one "#10" means.

import { describe, it, expect } from 'vitest'
import { ownerModelId } from './element-owner'

const typeMaps = new Map<string, Map<number, string>>([
  ['arch', new Map([[10, 'IFCWALL'], [11, 'IFCDOOR']])],
  ['mep',  new Map([[10, 'IFCDUCTSEGMENT'], [20, 'IFCPIPESEGMENT']])],
])

describe('ownerModelId', () => {
  it('uses the model the caller names, even when another model was loaded first', () => {
    expect(ownerModelId(10, 'mep', 'arch', typeMaps)).toBe('mep')
  })

  it('without a model, prefers the active one — the model selection falls back to', () => {
    // The old fallback took the first model with that id: `arch` here, while
    // selectElement(10) highlighted #10 in `mep`.
    expect(ownerModelId(10, undefined, 'mep', typeMaps)).toBe('mep')
  })

  it('looks in the other models when the active one has no such id', () => {
    expect(ownerModelId(11, undefined, 'mep', typeMaps)).toBe('arch')
    expect(ownerModelId(20, undefined, 'arch', typeMaps)).toBe('mep')
  })

  it('falls back to the active model when no model has the id', () => {
    expect(ownerModelId(99, undefined, 'arch', typeMaps)).toBe('arch')
    expect(ownerModelId(99, undefined, null, typeMaps)).toBeNull()
  })
})
