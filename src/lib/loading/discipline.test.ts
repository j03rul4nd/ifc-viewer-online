// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { inferBatchName, inferDiscipline } from './discipline'

describe('inferDiscipline', () => {
  it('reads common discipline tokens', () => {
    expect(inferDiscipline('Hotel_Vela_ARC.ifc')).toBe('architecture')
    expect(inferDiscipline('Hotel_Vela_STR.ifc')).toBe('structure')
    expect(inferDiscipline('Hotel_Vela_MEP.ifc')).toBe('mep')
    expect(inferDiscipline('project-hvac-level2.ifc')).toBe('hvac')
    expect(inferDiscipline('Torre ELE v3.ifc')).toBe('electrical')
    expect(inferDiscipline('site_topo.ifc')).toBe('site')
    expect(inferDiscipline('FED_model.ifc')).toBe('coordination')
  })

  it('handles camelCase, accents and other languages', () => {
    expect(inferDiscipline('HotelVelaStructure.ifc')).toBe('structure')
    expect(inferDiscipline('Edificio_Estructura.ifc')).toBe('structure')
    expect(inferDiscipline('Casa-Arquitectura.IFC')).toBe('architecture')
    expect(inferDiscipline('Instalaciones_Climatización.ifc')).toBe('mep')
    expect(inferDiscipline('Fontanería.ifc')).toBe('plumbing')
  })

  it('trusts ISO 19650 role letters only inside a coded name', () => {
    expect(inferDiscipline('PRJ-XX-ZZ-M3-A-0001.ifc')).toBe('architecture')
    expect(inferDiscipline('PRJ-XX-ZZ-M3-S-0001.ifc')).toBe('structure')
    expect(inferDiscipline('A_House.ifc')).toBeNull()
    expect(inferDiscipline('Duplex.ifc')).toBeNull()
  })

  it('whole tokens only (no substring matches)', () => {
    expect(inferDiscipline('Starlight.ifc')).toBeNull()   // contains "st", "star" — not "str"
    expect(inferDiscipline('Archive2020.ifc')).toBeNull()
  })
})

describe('inferBatchName', () => {
  it('uses the common prefix without discipline tokens', () => {
    expect(inferBatchName(['Hotel_Vela_ARC.ifc', 'Hotel_Vela_STR.ifc', 'Hotel_Vela_MEP.ifc'])).toBe('Hotel Vela')
    expect(inferBatchName(['Hotel_Vela_ARC.ifc', 'hotel-vela-STR.ifc'])).toBe('Hotel Vela')
  })

  it('a single file keeps its non-discipline tokens', () => {
    expect(inferBatchName(['Hotel_Vela_ARC.ifc'])).toBe('Hotel Vela')
    expect(inferBatchName(['Duplex.ifc'])).toBe('Duplex')
    // Only discipline tokens: keep them rather than return nothing.
    expect(inferBatchName(['ARC.ifc'])).toBe('ARC')
  })

  it('returns null when the names share nothing meaningful', () => {
    expect(inferBatchName([])).toBeNull()
    expect(inferBatchName(['Tower.ifc', 'Bridge.ifc'])).toBeNull()
    expect(inferBatchName(['ARC_1.ifc', 'ARC_2.ifc'])).toBeNull()
  })
})

describe('inferBatchName — ISO 19650 container names', () => {
  it('drops volume/level placeholders and the information-type code', () => {
    expect(inferBatchName([
      'BCN-IVO-ZZ-XX-M3-A-0002.ifc',
      'BCN-IVO-ZZ-XX-M3-S-0002.ifc',
      'BCN-IVO-ZZ-XX-M3-M-0002.ifc',
    ])).toBe('BCN IVO')
  })
})
