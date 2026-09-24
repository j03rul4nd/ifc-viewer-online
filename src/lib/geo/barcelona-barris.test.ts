import { describe, expect, it } from 'vitest'
import {
  BARRI_TYPOLOGY,
  TYPOLOGY_ZONES,
  URBAN_TYPOLOGIES,
  barriAt,
  barriRings,
  isBarcelona,
  typologyProfile,
  type UrbanTypology,
} from './barcelona-barris'
import { BCN_BARRIS, BCN_BBOX, BCN_DISTRICTS } from './barcelona-barris.data'
import dataSource from './barcelona-barris.data.ts?raw'

describe('barriAt — known places', () => {
  const cases: [string, number, number, string | string[], string, UrbanTypology][] = [
    ['Passeig de Gràcia × Consell de Cent', 41.39095, 2.16545, "la Dreta de l'Eixample", "l'Eixample", 'eixample-cerda'],
    ['Sagrada Família', 41.4036, 2.1744, 'la Sagrada Família', "l'Eixample", 'eixample-cerda'],
    ['Mercat de Sant Antoni', 41.3787, 2.162, 'Sant Antoni', "l'Eixample", 'eixample-cerda'],
    ['Plaça Reial', 41.38, 2.1754, 'el Gòtic', 'Ciutat Vella', 'ciutat-vella-medieval'],
    ['Plaça de la Barceloneta', 41.3808, 2.1895, 'la Barceloneta', 'Ciutat Vella', 'barceloneta'],
    ['Plaça del Sol', 41.40075, 2.15722, 'la Vila de Gràcia', 'Gràcia', 'vila-antiga'],
    ['Rambla del Poblenou × Pujades', 41.4005, 2.2005, 'el Poblenou', 'Sant Martí', 'poblenou-industrial-22a'],
    ['Torre Glòries', 41.4034, 2.1894, 'el Parc i la Llacuna del Poblenou', 'Sant Martí', 'poblenou-industrial-22a'],
    ['Castell de Montjuïc (summit)', 41.3634, 2.1665, 'el Poble-sec', 'Sants-Montjuïc', 'hillside-park'],
    ['Plaça del Sortidor (Poble-sec, below the park)', 41.373, 2.1628, 'el Poble-sec', 'Sants-Montjuïc', 'mixed-urban'],
    ['Via Júlia', 41.4395, 2.1775, ['Verdun', 'la Prosperitat'], 'Nou Barris', 'poligon-1960s'],
    ['Hotel W', 41.3687, 2.1903, 'la Barceloneta', 'Ciutat Vella', 'modern-waterfront'],
    ['Hotel Arts', 41.3868, 2.1963, 'la Barceloneta', 'Ciutat Vella', 'modern-waterfront'],
    ['Pedralbes monastery', 41.3955, 2.1123, 'Pedralbes', 'les Corts', 'villa-residential'],
    ['Camp Nou', 41.3809, 2.1228, 'la Maternitat i Sant Ramon', 'les Corts', 'poligon-1960s'],
    ['Plaça d’Eivissa (Horta)', 41.43, 2.16, 'Horta', 'Horta-Guinardó', 'vila-antiga'],
    ['Zona Franca', 41.34, 2.14, 'la Marina del Prat Vermell', 'Sants-Montjuïc', 'port-industrial'],
    ['Park Güell', 41.4145, 2.1527, 'la Salut', 'Gràcia', 'hillside-park'],
  ]
  for (const [label, lat, lon, barri, district, typology] of cases) {
    it(label, () => {
      const hit = barriAt(lat, lon)
      expect(hit).not.toBeNull()
      if (Array.isArray(barri)) expect(barri).toContain(hit!.barri)
      else expect(hit!.barri).toBe(barri)
      expect(hit!.district).toBe(district)
      expect(hit!.typology).toBe(typology)
    })
  }

  it('reports the zone that overrode the barri typology', () => {
    expect(barriAt(41.3634, 2.1665)!.zone).toBe('montjuic-park')
    expect(barriAt(41.3808, 2.1895)!.zone).toBeNull()
  })

  it('returns null outside Barcelona', () => {
    expect(barriAt(40.4168, -3.7038)).toBeNull() // Madrid
    expect(isBarcelona(40.4168, -3.7038)).toBe(false)
    // L'Hospitalet: inside the bbox prefilter, outside every barri.
    expect(isBarcelona(41.3597, 2.0999)).toBe(true)
    expect(barriAt(41.3597, 2.0999)).toBeNull()
  })

  it('is deterministic across calls', () => {
    expect(barriAt(41.38, 2.1754)).toEqual(barriAt(41.38, 2.1754))
  })
})

describe('data module', () => {
  it('holds the 10 districts and 73 barris with unique names and codes', () => {
    expect(BCN_DISTRICTS).toHaveLength(10)
    expect(BCN_BARRIS).toHaveLength(73)
    expect(new Set(BCN_BARRIS.map((b) => b.n)).size).toBe(73)
    expect(BCN_BARRIS.map((b) => b.c).sort((a, b) => a - b)).toEqual(Array.from({ length: 73 }, (_, i) => i + 1))
    for (const b of BCN_BARRIS) {
      expect(b.d).toBeGreaterThanOrEqual(0)
      expect(b.d).toBeLessThan(10)
    }
  })

  it('every barri of every district is present', () => {
    const perDistrict = BCN_DISTRICTS.map((_, i) => BCN_BARRIS.filter((b) => b.d === i).length)
    expect(perDistrict).toEqual([4, 6, 8, 3, 6, 5, 11, 13, 7, 10])
  })

  it('stays small', () => {
    expect(dataSource.length).toBeLessThan(60 * 1024)
  })

  it('the isBarcelona bbox contains every ring vertex', () => {
    for (const b of barriRings()) {
      expect(b.rings.length).toBeGreaterThan(0)
      for (const ring of b.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(3)
        for (const [lat, lon] of ring) {
          expect(isBarcelona(lat, lon)).toBe(true)
          expect(lat).toBeGreaterThanOrEqual(BCN_BBOX[0])
          expect(lon).toBeLessThanOrEqual(BCN_BBOX[3])
        }
      }
    }
  })
})

describe('typology table', () => {
  it('maps every one of the 73 barris, and nothing else', () => {
    const names = BCN_BARRIS.map((b) => b.n).sort()
    expect(Object.keys(BARRI_TYPOLOGY).sort()).toEqual(names)
    for (const t of Object.values(BARRI_TYPOLOGY)) expect(URBAN_TYPOLOGIES).toContain(t)
  })

  it('zones reference real barris and typologies', () => {
    for (const z of TYPOLOGY_ZONES) {
      expect(URBAN_TYPOLOGIES).toContain(z.typology)
      expect(z.ring.length).toBeGreaterThanOrEqual(3)
      for (const n of z.barris ?? []) expect(BARRI_TYPOLOGY[n]).toBeDefined()
    }
  })
})

describe('typologyProfile', () => {
  const inUnit = (v: number) => v >= 0 && v <= 1
  for (const t of URBAN_TYPOLOGIES) {
    it(`${t} is complete and plausible`, () => {
      const p = typologyProfile(t)
      expect(p).toBeDefined()
      const { min, max, default: def } = p.storeys
      expect(Number.isInteger(min) && Number.isInteger(max) && Number.isInteger(def)).toBe(true)
      expect(min).toBeGreaterThanOrEqual(1)
      expect(min).toBeLessThanOrEqual(def)
      expect(def).toBeLessThanOrEqual(max)
      expect(max).toBeLessThanOrEqual(60)
      expect(p.groundFloorHeightM).toBeGreaterThanOrEqual(2.8)
      expect(p.groundFloorHeightM).toBeLessThanOrEqual(8)
      expect(p.upperStoreyHeightM).toBeGreaterThanOrEqual(2.6)
      expect(p.upperStoreyHeightM).toBeLessThanOrEqual(4.5)
      expect(p.facadePalette.length).toBeGreaterThanOrEqual(5)
      expect(p.facadePalette.length).toBeLessThanOrEqual(8)
      for (const c of [...p.facadePalette, p.shutterTone, p.windowFrameTone, ...p.roof.tones]) {
        expect(c).toHaveLength(3)
        expect(c.every(inUnit)).toBe(true)
      }
      expect(p.roof.tones.length).toBeGreaterThanOrEqual(1)
      expect(p.windowWidthM).toBeGreaterThan(0.6)
      expect(p.windowWidthM).toBeLessThan(p.bayM)
      expect(p.bayM).toBeLessThanOrEqual(8)
      expect(inUnit(p.balcony.probability)).toBe(true)
      expect(p.balcony.depthM).toBeGreaterThanOrEqual(0)
      expect(p.balcony.depthM).toBeLessThanOrEqual(2.5)
      expect(inUnit(p.attic.probability)).toBe(true)
      expect(p.attic.setbackM).toBeGreaterThanOrEqual(0)
      expect(p.attic.setbackM).toBeLessThanOrEqual(5)
      expect(inUnit(p.roof.flatTerraceProbability)).toBe(true)
      expect(p.roof.parapetHeightM).toBeGreaterThanOrEqual(0.3)
      expect(p.roof.parapetHeightM).toBeLessThanOrEqual(1.5)
    })
  }

  it('eixample-cerda carries the Cerdà block rule and lands at ~20–24 m by default', () => {
    const p = typologyProfile('eixample-cerda')
    expect(p.cerdaBlock).not.toBeNull()
    expect(p.cerdaBlock!.buildableDepthM).toBeGreaterThanOrEqual(20)
    expect(p.cerdaBlock!.buildableDepthM).toBeLessThanOrEqual(35)
    expect(p.cerdaBlock!.interiorGroundFloorHeightM).toBeGreaterThan(3)
    expect(p.cerdaBlock!.interiorGroundFloorHeightM).toBeLessThan(7)
    const h = p.groundFloorHeightM + (p.storeys.default - 1) * p.upperStoreyHeightM
    expect(h).toBeGreaterThanOrEqual(20)
    expect(h).toBeLessThanOrEqual(26)
  })

  it('off-grid typologies have no Cerdà block rule', () => {
    for (const t of ['ciutat-vella-medieval', 'barceloneta', 'vila-antiga', 'poligon-1960s'] as const)
      expect(typologyProfile(t).cerdaBlock).toBeNull()
  })
})
