// ─── the two spellings of "this element has a port" ───────────────────────────
// A regression test for a bug the Poblenou services model found: RULE_CONNECTED_MEP
// read only IfcRelConnectsPortToElement, which IFC2x3 uses and IFC4 DEPRECATED in
// favour of nesting the port under its element with IfcRelNests. Every duct run
// written by IfcOpenShell, Revit or ArchiCAD therefore came back "disconnected"
// while being perfectly connected.
//
// What makes that bug survivable is that nothing failed. The rule ran, produced
// warnings, and the warnings looked like findings. It took a model we KNEW was
// right to notice they were not.
//
// So this test uses that model, through the app's own parser, and asserts both
// halves: the file really does nest its ports (if it ever stopped, the test would
// pass for the wrong reason), and the lookup really does see them.
//
// Lives in scripts/ with the other fixture tests because it reads a committed
// .ifc off disk, which the browser tsconfig has no node:fs for.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync } from 'fs'
import path from 'path'
import { collectPortedElements } from '../../src/lib/ifc-ports'

const MEP = path.join(process.cwd(), 'public', 'models', 'poblenou', 'BCN-IVO-ZZ-XX-M3-M-0001.ifc')

let api: IfcAPI
let model: number

/* eslint-disable @typescript-eslint/no-explicit-any */
const idsOf = (ifcClass: string): number[] => {
  const type = (api as any).GetIfcEntityList(model).find(
    (t: number) => api.GetNameFromTypeCode(t).toUpperCase() === ifcClass,
  )
  if (type == null) return []
  const ids = api.GetLineIDsWithType(model, type)
  return Array.from({ length: ids.size() }, (_, i) => ids.get(i))
}

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  model = api.OpenModel(new Uint8Array(readFileSync(MEP)))
}, 30_000)

afterAll(() => {
  api?.CloseModel?.(model)
  api?.Dispose?.()
})

describe('collectPortedElements', () => {
  it('is looking at a file that nests its ports the IFC4 way', () => {
    // The premise. IfcRelConnectsPortToElement is deprecated in IFC4 and this
    // file must not contain any, or the test below could pass on the legacy
    // path and the IFC4 path would go back to being untested.
    expect(idsOf('IFCDISTRIBUTIONPORT').length).toBeGreaterThan(0)
    expect(idsOf('IFCRELNESTS').length).toBeGreaterThan(0)
    expect(idsOf('IFCRELCONNECTSPORTTOELEMENT')).toHaveLength(0)
  })

  it('finds every duct segment and fitting that carries a port', () => {
    const ported = collectPortedElements(api, model)
    // Three spines and six bends, each with at least one port on it.
    for (const id of [...idsOf('IFCDUCTSEGMENT'), ...idsOf('IFCDUCTFITTING')]) {
      expect(ported.has(id), `#${id} has a port but was not seen to`).toBe(true)
    }
    expect(ported.size).toBe(idsOf('IFCDUCTSEGMENT').length + idsOf('IFCDUCTFITTING').length)
  })

  it('does not credit an element that has no port', () => {
    // Air terminals in this model are served but unported. A lookup that
    // returned every element in an IfcRelNests would call them connected, and
    // the rule would then find nothing wrong with anything, ever.
    const ported = collectPortedElements(api, model)
    for (const id of idsOf('IFCAIRTERMINAL')) {
      expect(ported.has(id), `#${id} has no port and should not be listed`).toBe(false)
    }
  })
})
