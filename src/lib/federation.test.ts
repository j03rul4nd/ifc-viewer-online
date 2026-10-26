import { describe, it, expect } from 'vitest'
import { detectDiscipline, matchesQuery, captureView, resolveView, viewsFor, invertVisibility, clampOpacity } from './federation'

describe('detectDiscipline', () => {
  it('reads the ISO 19650 role field', () => {
    expect(detectDiscipline('HV-ARQ-ZZ-M3-S-001.ifc')).toBe('S')
    expect(detectDiscipline('PRJ-ORG-ZZ-XX-M3-A-0001.ifc')).toBe('A')
    expect(detectDiscipline('PRJ-ORG-01-XX-M3-M-0001.ifc')).toBe('M')
    expect(detectDiscipline('PRJ_ORG_ZZ_M3_E_0002.ifc')).toBe('E')
    expect(detectDiscipline('PRJ-ORG-ZZ-M3-H-0002.ifc')).toBe('M')
  })
  it('falls back to words, in several languages', () => {
    expect(detectDiscipline('Edificio_Arquitectura_v3.ifc')).toBe('A')
    expect(detectDiscipline('estructura final.ifc')).toBe('S')
    expect(detectDiscipline('Building_HVAC.ifc')).toBe('M')
    expect(detectDiscipline('fontaneria.ifc')).toBe('P')
    expect(detectDiscipline('Sprinkler layout.ifc')).toBe('F')
    expect(detectDiscipline('Project MEP.ifc')).toBe('M')
  })
  it('says "other" when the name says nothing', () => {
    expect(detectDiscipline('model.ifc')).toBe('X')
    expect(detectDiscipline('Duplex.ifc')).toBe('X')
  })
})

describe('matchesQuery', () => {
  it('ignores case, accents and word order', () => {
    expect(matchesQuery('Fontanería Planta 2.ifc', 'planta fontaneria')).toBe(true)
    expect(matchesQuery('Fontanería Planta 2.ifc', 'clima')).toBe(false)
    expect(matchesQuery('anything', '   ')).toBe(true)
  })
})

describe('views', () => {
  const models = [
    { id: 'a1', fileName: 'A.ifc', visible: true },
    { id: 's1', fileName: 'S.ifc', visible: false },
  ]
  it('round-trips by file name across new model ids', () => {
    const view = captureView('Clash', models, { a1: 0.2 }, true, 1000)
    expect(view.opacity).toEqual({ 'A.ifc': 0.2 })
    const reloaded = [
      { id: 'a2', fileName: 'A.ifc', visible: false },
      { id: 's2', fileName: 'S.ifc', visible: true },
      { id: 'm2', fileName: 'M.ifc', visible: true },
    ]
    const r = resolveView(view, reloaded)
    expect(r.visible).toEqual({ a2: true, s2: false })
    expect(r.opacity).toEqual({ a2: 0.2, s2: 1 })
    expect(r.matched).toBe(2)
  })
  it('lists only views that name an open file', () => {
    const v = captureView('x', models, {}, false)
    expect(viewsFor([v], [{ id: 'z', fileName: 'Z.ifc', visible: true }])).toEqual([])
    expect(viewsFor([v], models)).toHaveLength(1)
  })
})

describe('invertVisibility', () => {
  it('swaps, but never inverts into an empty scene', () => {
    expect(invertVisibility([{ id: 'a', fileName: 'a', visible: true }, { id: 'b', fileName: 'b', visible: false }])).toEqual({ a: false, b: true })
    expect(invertVisibility([{ id: 'a', fileName: 'a', visible: true }])).toEqual({ a: true })
  })
})

it('clampOpacity keeps the viewer range', () => {
  expect(clampOpacity(0)).toBe(0.02)
  expect(clampOpacity(3)).toBe(1)
  expect(clampOpacity(NaN)).toBe(1)
})
