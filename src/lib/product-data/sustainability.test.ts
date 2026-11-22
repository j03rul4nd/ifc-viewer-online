import { describe, it, expect } from 'vitest'
import type { IFCEffectivePropertySet, IFCItemData } from '../ifc-item-data'
import { httpsUrl, indicatorOf, summarizeSustainability, SustainabilityBuilder, SUSTAINABILITY_MAX_MATERIALS } from './sustainability'

type P = [string, string | number, string?]
const set = (name: string, props: P[]): IFCEffectivePropertySet => ({
  name, properties: props.map(([n, value, unit]) => ({ expressId: 0, name: n, value, ...(unit ? { unit } : {}), source: 'occurrence' as const })),
})
const el = (sets: IFCEffectivePropertySet[], materials: string[] = []) =>
  ({ effectivePropertySets: sets, materials: materials.map((name) => ({ name })) }) as unknown as IFCItemData

describe('indicatorOf', () => {
  it('IFC4 Indicators (PerUnit), Values and IFC2x3 names', () => {
    expect(indicatorOf('ClimateChangePerUnit', true)).toBe('gwp')
    expect(indicatorOf('ClimateChange', true)).toBe('gwp')
    expect(indicatorOf('TotalPrimaryEnergyConsumptionPerUnit', true)).toBe('energy')
    expect(indicatorOf('WaterConsumption', true)).toBe('water')
    expect(indicatorOf('RenewableEnergyConsumptionPerUnit', true)).toBe('energyRenewable')
    expect(indicatorOf('NonRenewableEnergyConsumptionPerUnit', true)).toBe('energyNonRenewable')
    expect(indicatorOf('StratosphericOzoneLayerDestructionPerUnit', true)).toBe('ozoneDepletion')
  })
  it('manufacturer names, A1-A3 stage', () => {
    expect(indicatorOf('GWP-total A1-A3', false)).toBe('gwpA1A3')
    expect(indicatorOf('GWP_A1-A3 (kgCO2e)', false)).toBe('gwpA1A3')
    expect(indicatorOf('EmbodiedCarbon', false)).toBe('gwp')
    expect(indicatorOf('GlobalWarmingPotential', false)).toBe('gwp')
  })
  it('short generic names only inside an LCA set; unrelated names ignored', () => {
    expect(indicatorOf('AP', false)).toBeNull()
    expect(indicatorOf('AP', true)).toBe('acidification')
    expect(indicatorOf('Width', false)).toBeNull()
    expect(indicatorOf('Weight A1-A3', false)).toBeNull()
  })
})

describe('httpsUrl', () => {
  it('keeps https, drops http / javascript / relative', () => {
    expect(httpsUrl('https://epd.example/123')).toBe('https://epd.example/123')
    expect(httpsUrl('http://epd.example/123')).toBeNull()
    expect(httpsUrl('javascript:alert(1)')).toBeNull()
    expect(httpsUrl('/epd/1')).toBeNull()
  })
})

describe('summarizeSustainability', () => {
  it('null when the model has nothing', () => {
    expect(summarizeSustainability([el([set('Pset_WallCommon', [['IsExternal', 'true']])])])).toBeNull()
  })

  it('reads the standard set as ifc, with unit, basis and declared unit', () => {
    const s = summarizeSustainability([el([set('Pset_EnvironmentalImpactIndicators', [
      ['Reference', 'EPD-ABC-0042'], ['FunctionalUnitReference', '1 m2'], ['LifeCyclePhase', 'Production'],
      ['ClimateChangePerUnit', 12.5, 'kg'], ['WaterConsumptionPerUnit', 0.3, 'm³'],
    ])], ['Concrete C30/37'])])!
    expect(s.declaredUnit).toBe('1 m2')
    expect(s.epd).toMatchObject({ number: 'EPD-ABC-0042', source: 'ifc' })
    expect(s.indicators.map((i) => i.key)).toEqual(['gwp', 'water'])
    expect(s.indicators[0]).toMatchObject({ value: 12.5, unit: 'kg', basis: 'perUnit', source: 'ifc', stage: 'Production', count: 1 })
    expect(s.materials).toEqual(['Concrete C30/37'])
    expect(s.fromPsets).toBe(false)
  })

  it('manufacturer EPD set: flagged pset, https link only, A1-A3 first', () => {
    const s = summarizeSustainability([el([set('Acme_EPD', [
      ['EPD Number', 'S-P-01234'], ['EPD URL', 'https://environdec.example/S-P-01234'], ['Programme', 'EPD International'],
      ['Valid until', '2029-05-01'], ['Declared unit', '1 kg'], ['GWP-total A1-A3', '1,85'], ['PET', 20],
    ])])])!
    expect(s.epd).toEqual({ number: 'S-P-01234', url: 'https://environdec.example/S-P-01234', programme: 'EPD International', validUntil: '2029-05-01', source: 'pset' })
    expect(s.indicators[0]).toMatchObject({ key: 'gwpA1A3', value: 1.85, stage: 'A1-A3', source: 'pset', basis: 'unknown' })
    expect(s.indicators.map((i) => i.key)).toContain('energy')
    expect(s.declaredUnit).toBe('1 kg')
    expect(s.fromPsets).toBe(true)
    const bad = summarizeSustainability([el([set('Acme_EPD', [['EPD URL', 'javascript:alert(1)'], ['EPD Number', 'X']])])])!
    expect(bad.epd!.url).toBeNull()
  })

  it('counts elements, flags differing values, standard value replaces manufacturer one', () => {
    const s = summarizeSustainability([
      el([set('Mfr', [['GWP', 10]])]),
      el([set('Pset_EnvironmentalImpactValues', [['ClimateChange', 11]])]),
      el([set('Pset_WallCommon', [['IsExternal', 'true']])]),
    ])!
    expect(s.elements).toBe(3)
    expect(s.withData).toBe(2)
    expect(s.indicators[0]).toMatchObject({ key: 'gwp', value: 11, source: 'ifc', basis: 'element', count: 2, varies: true })
  })

  it('caps materials and carries truncation', () => {
    const b = new SustainabilityBuilder()
    for (let i = 0; i < SUSTAINABILITY_MAX_MATERIALS + 10; i++) b.add(el([], [`M${i}`]))
    b.truncated = true
    const s = b.result()!
    expect(s.materials).toHaveLength(SUSTAINABILITY_MAX_MATERIALS)
    expect(s.truncated).toBe(true)
  })
})
