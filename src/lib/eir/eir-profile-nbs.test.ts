import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import type { IdsElement } from '../ids/ids-types'
import { gatherIdsElements } from '../ids/ids-gather'
import { runIdsChecks } from '../ids/ids-engine'
import { compileEirToIds } from './eir-compiler'
import { BUILTIN_EIR_PROFILES } from './eir-profiles'
import { NBS_BOS, NBS_BOS_CLASSES, NBS_BOS_MANUAL } from './eir-profile-nbs'
import { validateElements } from './index'
import { parseEirProfile } from './eir-schema'
// IfcWall unclassified, IfcSlab / IfcColumn / IfcBeam classified in system "Foobar".
import fixtureIfc from '../ids/ids-fixtures/classification/fail-a_classification_facet_with_no_data_matches_any_classification_1_2.ifc?raw'

let seq = 0
const door = (psets: IdsElement['psets'], classifications?: IdsElement['classifications']): IdsElement =>
  ({ expressId: ++seq, ifcClass: 'IFCDOOR', attributes: { Name: 'Door' }, psets, classifications })

const fullDoor = () => door(
  {
    Pset_DoorCommon: { Reference: 'D-01', IsExternal: true },
    Pset_ManufacturerTypeInformation: { Manufacturer: 'Acme', ModelReference: 'AC-900' },
  },
  [{ system: 'Uniclass 2015', value: 'Pr_30_59_24' }],
)

describe('builtin-nbs-bos', () => {
  it('is registered, valid and compiles one spec per rule', () => {
    expect(BUILTIN_EIR_PROFILES.find((p) => p.id === 'builtin-nbs-bos')).toBe(NBS_BOS)
    expect(() => parseEirProfile(JSON.stringify(NBS_BOS))).not.toThrow()
    expect(compileEirToIds(NBS_BOS).specifications).toHaveLength(NBS_BOS.rules.length)
    expect(NBS_BOS.rules).toHaveLength(NBS_BOS_CLASSES.length * 6)
    expect(NBS_BOS.rules.every((r) => r.optional)).toBe(true)
    expect(NBS_BOS_MANUAL.some((c) => /IfcTypeObject/.test(c))).toBe(true)
    expect(NBS_BOS_MANUAL.some((c) => /[Gg]eometry/.test(c))).toBe(true)
  })

  it('a complete door object passes; other classes are n/a', () => {
    const r = validateElements([fullDoor()], NBS_BOS)
    expect(r.failedSpecs).toBe(0)
    expect(r.passedSpecs).toBe(6)
    expect(r.naSpecs).toBe(NBS_BOS.rules.length - 6)
    expect(r.score).toBe(100)
  })

  it('a geometry-only door fails every information clause', () => {
    const r = validateElements([door({})], NBS_BOS)
    expect(r.failedSpecs).toBe(6)
    expect(r.passedSpecs).toBe(0)
  })

  it('a non-Uniclass classification passes "classified" but fails Uniclass', () => {
    const d = fullDoor()
    d.classifications = [{ system: 'OmniClass', value: '23-30 20 17' }]
    const r = validateElements([d], NBS_BOS)
    const failed = r.specs.filter((s) => s.status === 'fail').map((s) => s.name)
    expect(failed).toEqual(['Door: classified with Uniclass 2015'])
  })
})

describe('builtin-nbs-bos on IDS test-case IFC fixtures', () => {
  let api: IfcAPI
  beforeAll(async () => { api = new IfcAPI(); await api.Init() }, 30_000)
  afterAll(() => { api?.Dispose?.() })

  async function run(ifc: string) {
    const doc = compileEirToIds(NBS_BOS)
    const modelId = api.OpenModel(new TextEncoder().encode(ifc))
    try {
      return runIdsChecks(doc, await gatherIdsElements(api, modelId, doc), { modelSchema: api.GetModelSchema(modelId) })
    } finally { api.CloseModel(modelId) }
  }
  const status = (r: Awaited<ReturnType<typeof run>>, name: string) => r.specs.find((s) => s.name === name)?.status

  it('classified slab passes "classified" and fails Uniclass/pset/manufacturer; unclassified wall fails; doors n/a', async () => {
    const r = await run(fixtureIfc)
    expect(status(r, 'Slab: carries a classification code')).toBe('pass')
    expect(status(r, 'Slab: classified with Uniclass 2015')).toBe('fail')
    expect(status(r, 'Slab: has the IFC common property set Pset_SlabCommon')).toBe('fail')
    expect(status(r, 'Slab: names the manufacturer (Pset_ManufacturerTypeInformation.Manufacturer)')).toBe('fail')
    expect(status(r, 'Wall: carries a classification code')).toBe('fail')
    expect(status(r, 'Door: carries a classification code')).toBe('na')
    expect(r.passedSpecs).toBe(1)
  })
})
