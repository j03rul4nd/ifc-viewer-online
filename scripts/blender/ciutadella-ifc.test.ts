// ─── the Ciutadella Pavilion, asserted ────────────────────────────────────────
// The reference model that exists for MAP MODE: an exhibition pavilion on the
// Passeig de Lluís Companys, 80 m from the Arc de Triomf, authored on the
// promenade's own axis through a real IfcMapConversion.
//
// So the checks here are the usual "is this file correct" ones — schema,
// spatial tree, materials, quantities, nothing clashing — plus the two that are
// specific to what this model is FOR:
//
//   • the georeferencing agrees with itself. The map conversion and the site's
//     latitude/longitude are two statements about one place, and the second is
//     re-projected and compared on the ground rather than against the same
//     digits the generator used. A constant compared with itself is not a check.
//   • the building is turned the way the street is. The axis pair is what
//     carries that, and a model that lands square to north on this promenade is
//     the exact failure the file exists to rule out.
//
// Counts are DERIVED from the grid below, never copied out of the build script:
// a table that agrees with the generator because both were typed by the same
// hand cannot catch the generator changing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import proj4 from 'proj4'
import { DEMO_MODELS } from '../../src/demo-models/models'

const DIR = path.join(process.cwd(), 'public', 'models', 'ciutadella')
const FILE = 'BCN-IVO-ZZ-XX-M3-Z-0003.ifc'

/** The grid the pavilion is built on — everything below is counted from it. */
const GRID_X = [0, 4, 8, 12, 16, 20, 24]
const GRID_Y = [0, 6, 12]
const MEZZ_X = 8
const WIDTH = 24
const DEPTH = 12

/** The georeferencing the file must carry. */
const EPSG = 'EPSG:25831'
const EASTINGS = 431543.18
const NORTHINGS = 4582439.59
const HEIGHT = 18.5
const ROTATION_DEG = -45.5

/** Storeys, and the elevation each must sit at. */
const LEVELS: Array<[string, number]> = [
  ['Foundation', -0.9],
  ['Ground', 0.0],
  ['Mezzanine', 3.6],
  ['Roof', 7.2],
]

const RIDGE_Z = 9.2

/** Classes the app's clash rule sweeps, and the penetration it reports at. */
const CLASH_CLASSES = ['IFCWALL', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCROOF', 'IFCMEMBER',
                       'IFCPLATE', 'IFCFOOTING', 'IFCPILE']
const CLASH_PENETRATION = 0.05

/** What the grid says has to be there. */
const mezzLines = GRID_X.filter((x) => x <= MEZZ_X)
const POPULATION: Record<string, number> = {
  // One pad per grid intersection, plus one under each canopy post.
  IfcFooting: GRID_X.length * GRID_Y.length + 2,
  // Split under the mezzanine, continuous in the double-height half, plus posts.
  IfcColumn: mezzLines.length * GRID_Y.length * 2
    + (GRID_X.length - mezzLines.length) * GRID_Y.length + 2,
  // Every span between adjacent columns, at the mezzanine and at the eaves.
  IfcBeam: GRID_Y.length * (mezzLines.length - 1) + mezzLines.length * (GRID_Y.length - 1)
    + GRID_Y.length * (GRID_X.length - 1) + GRID_X.length * (GRID_Y.length - 1),
  // Ground, mezzanine, and the four runs of the paved ring.
  IfcSlab: 2 + 4,
  IfcCurtainWall: 2,
  IfcPlate: 2 * (WIDTH / 3),
  IfcWall: 2,
  IfcDoor: 1,
  IfcRoof: 2,
  IfcStair: 1,
  IfcStairFlight: 1,
  IfcRailing: 2,
  IfcSpace: 3,
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any

let api: IfcAPI
let model: number
let index: Map<string, Line[]>
let classOf: Map<number, string>

const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''
const num = (v: { value?: unknown } | null | undefined): number =>
  v && typeof v.value === 'number' ? v.value : NaN

const of = (ifcClass: string): Line[] => index.get(ifcClass.toUpperCase()) ?? []
const deep = (id: number): Line => api.GetLine(model, id, true)
const named = (name: string): Line | undefined =>
  [...index.values()].flat().find((l) => str(l.Name) === name)

/**
 * Elements with no body of their own — their geometry lives in their parts, so
 * GetFlatMesh rightly returns nothing for them.
 */
const BODILESS = new Set(['IFCCURTAINWALL', 'IFCSTAIR'])

function products(): Line[] {
  return Object.keys(POPULATION).flatMap((c) => of(c))
}
function solids(): Line[] {
  return products().filter((e) => !BODILESS.has(classOf.get(e.expressID) ?? ''))
}

/** World-space AABB of one element, in IFC axes (Z up). */
function extents(expressID: number): Array<[number, number]> {
  const mesh = api.GetFlatMesh(model, expressID)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let g = 0; g < mesh.geometries.size(); g++) {
    const placed = mesh.geometries.get(g)
    const m = placed.flatTransformation
    const geom = api.GetGeometry(model, placed.geometryExpressID)
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
    for (let i = 0; i < verts.length; i += 6) {
      const [x, y, z] = [verts[i], verts[i + 1], verts[i + 2]]
      const w = [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]
      // web-ifc hands geometry over Y-up for three.js; IFC is Z-up.
      const ifc = [w[0], -w[2], w[1]]
      ifc.forEach((v, a) => { lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v) })
    }
  }
  return [[lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]]]
}

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  model = api.OpenModel(new Uint8Array(readFileSync(path.join(DIR, FILE))))
  index = new Map()
  classOf = new Map()
  for (const type of api.GetIfcEntityList(model)) {
    const name = api.GetNameFromTypeCode(type).toUpperCase()
    const ids = api.GetLineIDsWithType(model, type)
    const lines: Line[] = []
    for (let i = 0; i < ids.size(); i++) {
      const entity = api.GetLine(model, ids.get(i), false)
      classOf.set(entity.expressID, name)
      lines.push(entity)
    }
    index.set(name, (index.get(name) ?? []).concat(lines))
  }
}, 120_000)

afterAll(() => { api?.CloseModel(model) })

describe('the file itself', () => {
  it('is IFC4 and opens through the parser the app ships', () => {
    expect(api.GetModelSchema(model)).toBe('IFC4')
    expect(of('IfcProject')).toHaveLength(1)
  })

  it('is named the way a CDE expects', () => {
    // Project-Originator-Volume-Level-Type-Role-Number, role Z for a
    // multidisciplinary model: one drag has to be the whole demo.
    expect(FILE).toMatch(/^[A-Z]{3}-[A-Z]{3}-[A-Z]{2}-[A-Z]{2}-M3-[A-Z]-\d{4}\.ifc$/)
  })

  it('stays a file somebody can be handed at a stand', () => {
    const kb = statSync(path.join(DIR, FILE)).size / 1024
    expect(kb).toBeGreaterThan(100)
    expect(kb, 'a demo nobody waits for').toBeLessThan(600)
  })
})

describe('the spatial tree', () => {
  it('runs project → site → building → storeys', () => {
    expect(of('IfcSite')).toHaveLength(1)
    expect(of('IfcBuilding')).toHaveLength(1)
    expect(of('IfcBuildingStorey')).toHaveLength(LEVELS.length)
  })

  it('puts every storey at its own elevation, ascending', () => {
    const found = of('IfcBuildingStorey')
      .map((s) => [str(s.Name), num(s.Elevation)] as [string, number])
      .sort((a, b) => a[1] - b[1])
    expect(found).toEqual(LEVELS)
  })

  it('contains every element in a storey, and no element in two', () => {
    const contained = new Map<number, number>()
    for (const rel of of('IfcRelContainedInSpatialStructure')) {
      for (const e of rel.RelatedElements) {
        contained.set(e.value, (contained.get(e.value) ?? 0) + 1)
      }
    }
    const loose: string[] = []
    for (const element of products()) {
      if (classOf.get(element.expressID) === 'IFCSPACE') continue          // aggregated
      if (classOf.get(element.expressID) === 'IFCSTAIRFLIGHT') continue    // part of the stair
      if (classOf.get(element.expressID) === 'IFCPLATE') continue          // part of the wall
      if (!contained.has(element.expressID)) loose.push(str(element.Name))
    }
    expect(loose).toEqual([])
    expect([...contained.values()].filter((n) => n > 1)).toEqual([])
  })
})

describe('what is in it', () => {
  it('has exactly the elements the grid calls for', () => {
    const got: Record<string, number> = {}
    for (const ifcClass of Object.keys(POPULATION)) got[ifcClass] = of(ifcClass).length
    expect(got).toEqual(POPULATION)
  })

  it('decomposes its aggregates instead of drawing them twice', () => {
    // A curtain wall IS its panels and a stair IS its flights. Either one with
    // a body of its own would draw the same thing twice and let the two
    // disagree; either one WITHOUT its parts would be a name with nothing in it.
    for (const wall of of('IfcCurtainWall')) {
      const parts = of('IfcRelAggregates')
        .filter((r) => r.RelatingObject.value === wall.expressID)
        .flatMap((r) => r.RelatedObjects)
      expect(parts, str(wall.Name)).toHaveLength(WIDTH / 3)
      expect(api.GetFlatMesh(model, wall.expressID).geometries.size()).toBe(0)
    }
    const stair = of('IfcStair')[0]
    expect(api.GetFlatMesh(model, stair.expressID).geometries.size()).toBe(0)
  })

  it('gives every element a material ON THE OCCURRENCE', () => {
    // Not on the type: a bare IfcMaterial on a type is true in the schema and
    // invisible to every take-off tool and to the app's material rule.
    const material = new Set<number>()
    for (const rel of of('IfcRelAssociatesMaterial')) {
      for (const o of rel.RelatedObjects) material.add(o.value)
    }
    const bare = products()
      .filter((e) => classOf.get(e.expressID) !== 'IFCSPACE')
      .filter((e) => !material.has(e.expressID))
      .map((e) => str(e.Name))
    expect(bare).toEqual([])
  })

  it('gives every element its common property set and its quantities', () => {
    // Read through the definition's own name: `Pset_*` is the description,
    // `Qto_*` the measurement, and an element wants both. A take-off tool that
    // finds one and not the other reports a building with no quantities.
    const sets = new Map<number, string[]>()
    for (const rel of of('IfcRelDefinesByProperties')) {
      const definition = deep(rel.RelatingPropertyDefinition.value)
      for (const o of rel.RelatedObjects) {
        sets.set(o.value, (sets.get(o.value) ?? []).concat(str(definition.Name)))
      }
    }
    const missing = products()
      .filter((e) => {
        const names = sets.get(e.expressID) ?? []
        return !names.some((n) => n.startsWith('Pset_')) || !names.some((n) => n.startsWith('Qto_'))
      })
      .map((e) => `${classOf.get(e.expressID)} "${str(e.Name)}"`)
    expect(missing.slice(0, 8), `${missing.length} elements short of data`).toEqual([])
  })

  it('names and describes every element, and gives it a type', () => {
    const typed = new Set<number>()
    for (const rel of of('IfcRelDefinesByType')) {
      for (const o of rel.RelatedObjects) typed.add(o.value)
    }
    for (const element of products()) {
      const where = `${classOf.get(element.expressID)} "${str(element.Name)}"`
      expect(str(element.Name), where).not.toBe('')
      expect(str(element.Description), where).not.toBe('')
      expect(typed.has(element.expressID), `${where}: no type`).toBe(true)
    }
  })

  it('classifies what it contains', () => {
    expect(of('IfcClassification')).toHaveLength(1)
    expect(of('IfcRelAssociatesClassification').length).toBeGreaterThan(8)
  })
})

describe('the georeferencing, which is what this model is for', () => {
  it('carries a projected CRS and a map conversion, not just a latitude', () => {
    const crs = of('IfcProjectedCRS')
    expect(crs).toHaveLength(1)
    expect(str(crs[0].Name)).toBe(EPSG)

    const conv = of('IfcMapConversion')
    expect(conv).toHaveLength(1)
    expect(num(conv[0].Eastings)).toBeCloseTo(EASTINGS, 2)
    expect(num(conv[0].Northings)).toBeCloseTo(NORTHINGS, 2)
    expect(num(conv[0].OrthogonalHeight)).toBeCloseTo(HEIGHT, 2)
  })

  it('turns the building onto the promenade, not onto north', () => {
    const conv = of('IfcMapConversion')[0]
    const abscissa = num(conv.XAxisAbscissa)
    const ordinate = num(conv.XAxisOrdinate)
    expect(Math.hypot(abscissa, ordinate), 'the axis pair must be a unit vector')
      .toBeCloseTo(1, 6)
    const deg = (Math.atan2(ordinate, abscissa) * 180) / Math.PI
    expect(deg).toBeCloseTo(ROTATION_DEG, 3)
    // The failure this rules out: a model that lands square to the map grid.
    expect(Math.abs(deg) > 5, 'a rotation of ~0 means nobody georeferenced it').toBe(true)
  })

  it('agrees with its own latitude and longitude, on the ground', () => {
    // The trap this exists for: the site's lat/lon used to be compared against
    // the same hand-typed digits the generator used, which certified a 19 m
    // discrepancy for the life of the file. So project one into the other's
    // frame and measure the distance in metres.
    const site = of('IfcSite')[0]
    const parts = (v: Line): number[] =>
      (Array.isArray(v) ? v : v.value).map((n: Line) => (typeof n === 'number' ? n : n.value))
    const dms = (v: Line): number => {
      const p = parts(v)
      const sign = (p.find((n) => n !== 0) ?? 0) < 0 ? -1 : 1
      const [d = 0, m = 0, sec = 0, micro = 0] = p.map(Math.abs)
      return sign * (d + m / 60 + sec / 3600 + micro / 3.6e9)
    }
    const lat = dms(site.RefLatitude)
    const lon = dms(site.RefLongitude)
    proj4.defs('EPSG:25831', '+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs')
    const [e, n] = proj4('EPSG:4326', 'EPSG:25831', [lon, lat])
    const drift = Math.hypot(e - EASTINGS, n - NORTHINGS)
    expect(drift, `site lat/lon is ${drift.toFixed(2)} m from the map conversion`)
      .toBeLessThan(0.5)
    expect(num(site.RefElevation)).toBeCloseTo(HEIGHT, 2)
  })
})

describe('the building, measured', () => {
  it('stands where the grid says, and no taller than its ridge', () => {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const element of solids()) {
      if (classOf.get(element.expressID) === 'IFCSPACE') continue
      const box = extents(element.expressID)
      box.forEach(([a, b], axis) => {
        lo[axis] = Math.min(lo[axis], a)
        hi[axis] = Math.max(hi[axis], b)
      })
    }
    // The paved ring reaches furthest in plan; the roof ridge, in height.
    // The canopy and the paved ring both stop at -3.15: the apron is measured
    // from the envelope, and the canopy happens to reach exactly as far.
    expect(lo[0]).toBeCloseTo(-3.15, 1)
    expect(hi[0]).toBeCloseTo(WIDTH + 0.15 + 3.0, 1)
    expect(lo[1]).toBeCloseTo(-0.15 - 3.0, 1)
    expect(hi[1]).toBeCloseTo(DEPTH + 0.15 + 3.0, 1)
    expect(hi[2]).toBeCloseTo(RIDGE_Z + 0.2, 1)   // ridge plus the roof thickness
  })

  it('lands the stair on the gallery edge rather than through it', () => {
    // Run it the other way and the head of the flight goes through the slab it
    // is supposed to arrive on — the one stair mistake nobody sees in plan.
    const flight = named('Gallery Stair Flight')!
    const box = extents(flight.expressID)
    expect(box[0][0]).toBeCloseTo(MEZZ_X, 2)      // top of the flight at the slab edge
    expect(box[2][1]).toBeCloseTo(3.6, 2)         // arriving at mezzanine level
    const slab = named('Mezzanine Slab')!
    expect(extents(slab.expressID)[0][1]).toBeCloseTo(MEZZ_X, 2)
  })

  it('has nothing clashing with anything', () => {
    const boxes = CLASH_CLASSES.flatMap((c) =>
      of(c).map((e) => ({ name: `${c} "${str(e.Name)}"`, box: extents(e.expressID) })))
    const pairs = new Map<string, number>()
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlaps = boxes[i].box.every(([lo, hi], a) => {
          const [otherLo, otherHi] = boxes[j].box[a]
          return lo + CLASH_PENETRATION < otherHi && hi - CLASH_PENETRATION > otherLo
        })
        if (!overlaps) continue
        // Grouped by family pair: with a hundred elements, eight names tell you
        // nothing and "IFCCOLUMN × IFCPLATE: 392" tells you it is one mistake.
        const key = `${boxes[i].name.split(' ')[0]} × ${boxes[j].name.split(' ')[0]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
    expect([...pairs.entries()], 'clashing families').toEqual([])
  }, 120_000)
})

describe('the gallery entry', () => {
  it('offers the pavilion, pointing at the file that exists', () => {
    const entry = DEMO_MODELS.find((m) => m.fileName === FILE)
    expect(entry, 'no gallery entry for the Ciutadella pavilion').toBeDefined()
    expect(entry!.category).toBe('Reference')
    expect(entry!.schema).toBe('IFC4')
    const bytes = statSync(path.join(DIR, FILE)).size
    // Within 5%: the quoted size is what somebody decides to download on.
    expect(Math.abs(entry!.sizeBytes - bytes) / bytes).toBeLessThan(0.05)
  })
})
