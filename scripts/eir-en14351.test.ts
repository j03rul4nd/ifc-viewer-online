// ─── EN 14351-1 profile through the REAL IDS pipeline ────────────────────────
// The built-in "EN 14351-1 — windows & external doors" profile, compiled to
// IDS and run the way the app runs it: web-ifc reads the IFC, ids-gather
// builds elements (type properties merged into occurrences), the engine
// checks. On catalogue objects shaped like BESCOF's (test/fixtures/bescof).
//
// What this pins, beyond "it compiles":
//  • type-inherited properties satisfy the rules (the window's data is all
//    on its IfcWindowType);
//  • the IsExternal condition (`where`) scopes the rules — an interior door
//    is out of scope, not a failure;
//  • `optional` keeps a window file from failing every door rule.
//
// Lives in scripts/ for node:fs.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gatherIdsElements } from '../src/lib/ids/ids-gather'
import { runIdsChecks } from '../src/lib/ids/ids-engine'
import type { IdsResult } from '../src/lib/ids/ids-types'
import { compileEirToIds } from '../src/lib/eir/eir-compiler'
import { BUILTIN_EIR_PROFILES } from '../src/lib/eir/eir-profiles'

const profile = BUILTIN_EIR_PROFILES.find((p) => p.id === 'builtin-en14351-1')!
const fixture = (name: string): string => readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'bescof', name), 'utf8')

let api: IfcAPI
beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
}, 30_000)
afterAll(() => { api?.Dispose?.() })

async function check(ifcText: string): Promise<IdsResult> {
  const doc = compileEirToIds(profile)
  const modelId = api.OpenModel(new TextEncoder().encode(ifcText))
  try {
    const elements = await gatherIdsElements(api, modelId, doc)
    return runIdsChecks(doc, elements, { modelSchema: api.GetModelSchema(modelId) })
  } finally {
    api.CloseModel(modelId)
  }
}

/** rule id (en-w1…) → spec status; one spec per rule, in rule order. */
function statusById(result: IdsResult): Record<string, string> {
  expect(result.specs).toHaveLength(profile.rules.length)
  return Object.fromEntries(result.specs.map((s, i) => [profile.rules[i].id, s.status]))
}

describe('builtin-en14351-1', () => {
  it('cites its source and its limits, and uses only standard IFC property sets', () => {
    expect(profile.description).toContain('EN 14351-1:2006+A2:2016')
    expect(profile.description).toContain('Not covered')
    for (const r of profile.rules) {
      expect((r as { pset?: string }).pset, r.id).toMatch(/^Pset_(WindowCommon|DoorCommon|DoorWindowGlazingType|ManufacturerTypeInformation)$/)
      expect(r.optional, r.id).toBe(true)
    }
    expect(compileEirToIds(profile).specifications).toHaveLength(profile.rules.length)
    // One readable, distinct line per rule in the results list.
    expect(new Set(profile.rules.map((r) => r.message)).size).toBe(profile.rules.length)
  })

  it('a catalogue window (data on its type) declares everything but τv; door rules are n/a', async () => {
    const s = statusById(await check(fixture('V-70-PR.synthetic.ifc')))
    expect(s['en-w0']).toBe('pass')                     // IsExternal declared
    for (const id of ['en-w1', 'en-w2', 'en-w3', 'en-w4', 'en-w5', 'en-w7', 'en-w8']) expect(s[id], id).toBe('pass')
    expect(s['en-w6']).toBe('fail')                     // VisibleLightTransmittance not in the file
    for (const id of ['en-d0', 'en-d1', 'en-d2', 'en-d3', 'en-d4', 'en-d5', 'en-d6']) expect(s[id], id).toBe('na')
  }, 60_000)

  it('an external door is checked; the missing product-type code fails', async () => {
    const s = statusById(await check(fixture('PTA-EXT-80.synthetic.ifc')))
    for (const id of ['en-d0', 'en-d1', 'en-d2', 'en-d3', 'en-d4', 'en-d5']) expect(s[id], id).toBe('pass')
    expect(s['en-d6']).toBe('fail')                     // no ModelReference in Pset_ManufacturerTypeInformation
    for (const id of ['en-w0', 'en-w1', 'en-w8']) expect(s[id], id).toBe('na')
  }, 60_000)

  it('an interior door is out of scope, not a failure', async () => {
    const interior = fixture('PTA-EXT-80.synthetic.ifc').replace(
      "IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$)",
      "IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.F.),$)",
    )
    expect(interior).not.toBe(fixture('PTA-EXT-80.synthetic.ifc'))
    const result = await check(interior)
    const s = statusById(result)
    expect(s['en-d0']).toBe('pass')                     // IsExternal is declared (false)
    for (const id of ['en-d1', 'en-d2', 'en-d3', 'en-d4', 'en-d5', 'en-d6']) expect(s[id], id).toBe('na')
    expect(result.failedSpecs).toBe(0)
  }, 60_000)

  it('an IFC2x3 window typed by a style: occurrence values count, what is missing fails', async () => {
    const s = statusById(await check(fixture('window-ifc2x3.synthetic.ifc')))
    expect(s['en-w0']).toBe('pass')
    expect(s['en-w1']).toBe('pass')                     // Uw 1.5 on the occurrence, 1.6 on the style
    expect(s['en-w2']).toBe('fail')                     // no WindLoadRating anywhere
    expect(s['en-w7']).toBe('pass')                     // Manufacturer on the style
  }, 60_000)
})
