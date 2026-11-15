// ─── steel: fragments localId === IFC expressId ──────────────────────────────
// The geometry worker keys its map by STEP expressId; collect looks it up by
// the localId fragments gives. This pins that both are the same number, with
// the real converter (web-ifc WASM + IfcImporter) on the steel fixture.
// Lives in scripts/ for node:fs, like ifc-item-data.test.ts.

import { describe, it, expect } from 'vitest'
import { IfcImporter, SingleThreadedFragmentsModel } from '@thatopen/fragments'
import { readFileSync } from 'fs'
import path from 'path'
import { addImporterClasses } from '../src/lib/ifc-importer-classes'
import { STEEL_CATEGORIES, collectSteelParts, type SteelFragmentsLike } from '../src/lib/steel/collect'
import { geometryFromStep } from '../src/lib/steel/profiles'

const WASM = path.join(process.cwd(), 'node_modules', 'web-ifc') + path.sep
const FILE = path.join(process.cwd(), 'src', 'lib', 'steel', '__fixtures__', 'steel-small.ifc')

describe('steel fixture through the real converter', () => {
  it('localIds are the IFC expressIds, so geometry lands on the right part', async () => {
    const importer = new IfcImporter()
    importer.wasm = { path: WASM, absolute: true }
    addImporterClasses(importer)
    const log = console.log
    console.log = () => { /* quiet */ }
    let model: SingleThreadedFragmentsModel
    try {
      const frag = await importer.process({ bytes: new Uint8Array(readFileSync(FILE)) })
      model = new SingleThreadedFragmentsModel('steel-small', frag)
    } finally { console.log = log }

    const ids = Object.values(model.getItemsOfCategories(STEEL_CATEGORIES)).flat().sort((a, b) => a - b)
    expect(ids).toEqual([100, 101, 102, 103, 104])

    const geo = geometryFromStep(readFileSync(FILE, 'latin1'))
    const fragments: SteelFragmentsLike = {
      getItemsOfCategories: async (c) => model.getItemsOfCategories(c),
      getItemsData: async (i, o) => model.getItemsData(i, o as never),
    }
    const parts = await collectSteelParts([{ id: 'A', fragments }], undefined, undefined, async () => geo)
    const byId = new Map(parts.map((p) => [p.localId, p]))
    expect(byId.get(102)).toMatchObject({ profile: 'HEA200', ifcClass: 'IFCCOLUMN' })
    expect(byId.get(103)).toMatchObject({ profile: 'PL10x200', ifcClass: 'IFCPLATE' })
    expect(byId.get(100)).toMatchObject({ profile: 'IPE300', length: 6 })
    expect(byId.get(103)!.length).toBeNull()
    // 6 + 6 (beams, Qto) + 3 (column, Tekla); the plate adds no length.
    const total = parts.reduce((s, p) => s + (p.length ?? 0), 0)
    expect(total.toFixed(2)).toBe('15.00')
  }, 60_000)
})
