// ─── the tower reference model, asserted ──────────────────────────────────────
// Torre Poblenou is the model we point a camera at. That gives it one failure
// mode the other fixtures do not have: it can be schema-perfect and still look
// wrong, and "looks wrong" is invisible to every check that only reads
// attributes. So these tests read the GEOMETRY web-ifc hands the viewer and
// assert the shape — the stepped massing, the fins standing off the glass, the
// terrace railing stopping where the tower above begins.
//
// It is also the first reference model that is multi-disciplinary in ONE file,
// which means the clash sweep finally has teeth. In the pavilion the core walls
// and the columns they run past live in different files and were never
// compared; here they are neighbours, and if the core were drawn corner to
// corner on the column grid this test would say so.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { DEMO_MODELS } from '../../src/demo-models/models'

const DIR = path.join(process.cwd(), 'public', 'models', 'torre-poblenou')
const FILE = 'BCN-IVO-ZZ-XX-M3-Z-0002.ifc'

/**
 * The georeferencing the map mode depends on. These are the PAVILION's numbers,
 * on purpose: the two buildings share one site origin, so they must share one
 * map conversion exactly. See the shared-origin block at the bottom.
 */
const EPSG = 'EPSG:25831'
const EASTINGS = 432340.0
const NORTHINGS = 4583945.0
const HEIGHT = 12.5
const ROTATION_DEG = 45

/**
 * Where the tower sits in the site origin it SHARES with the pavilion. The
 * pavilion holds x 0..36; the tower starts eight bays along, which is what makes
 * the two stand side by side when both are loaded.
 */
const SITE_OFFSET_X = 57.6

/** The three stacked footprints, and the levels each one carries. */
const PODIUM: Footprint = [SITE_OFFSET_X + 0.0, 0.0, SITE_OFFSET_X + 50.4, 28.8]
const TOWER_A: Footprint = [SITE_OFFSET_X + 7.2, 7.2, SITE_OFFSET_X + 43.2, 21.6]
const TOWER_B: Footprint = [SITE_OFFSET_X + 14.4, 7.2, SITE_OFFSET_X + 36.0, 21.6]
type Footprint = [number, number, number, number]

const SLAB_T = 0.32
const GLAZING_T = 0.18
const SPANDREL_H = 1.20
const SPANDREL_PROUD = 0.12

/** Storey name → elevation. 18 of them, which is the point of this fixture. */
const LEVELS: Array<[string, number]> = [
  ['Foundation', -1.6], ['Ground', 0.0], ['Level 01', 5.4], ['Level 02', 9.6],
  ['Level 03', 13.8], ['Level 04', 18.0], ['Level 05', 22.2], ['Level 06', 26.4],
  ['Level 07', 30.6], ['Level 08', 34.8], ['Level 09', 39.0], ['Level 10', 43.2],
  ['Level 11', 47.4], ['Level 12', 51.6], ['Level 13', 55.8], ['Level 14', 60.0],
  ['Level 15', 64.2], ['Roof', 68.4],
]

/**
 * What the file contains. Every number here is DERIVED from the grid rather than
 * copied out of the build's own report — a count copied from the thing it is
 * meant to check only ever tells you the build did what the build did.
 *
 *   footings  8x5 podium grid                                          = 40
 *   columns   P: 2 storeys x 40, A: 8 x 18, B: 6 x 12                  = 296
 *   beams     P: 2 x 67, A: 8 x 27, B: 6 x 17                          = 452
 *   slabs     17 floor plates + 4 plaza paving strips                  = 21
 *   walls     16 storeys x 4 core + 4 roof parapet                     = 68
 *   plates    432 panel positions x (spandrel + vision glass)          = 864
 *   members   fins at interior joints, tier A 24 + tier B 16           = 40
 *   proxies   7 planters + plant enclosure + mast                      = 9
 */
const POPULATION: Record<string, number> = {
  IfcFooting: 40, IfcColumn: 296, IfcBeam: 452, IfcSlab: 21,
  IfcCurtainWall: 64, IfcPlate: 864, IfcMember: 40,
  IfcWall: 68, IfcDoor: 16, IfcStair: 16, IfcStairFlight: 16,
  IfcRailing: 10, IfcCovering: 2, IfcBuildingElementProxy: 9, IfcSpace: 16,
}

/** Classes the app's clash rule sweeps, and the penetration it reports at. */
const CLASH_CLASSES = ['IFCWALL', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCROOF', 'IFCMEMBER',
                       'IFCPLATE', 'IFCFOOTING', 'IFCPILE']
const CLASH_PENETRATION = 0.05

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any

let api: IfcAPI
let model: number
let index: Map<string, Line[]>
let classOf: Map<number, string>

/**
 * The pavilion, opened alongside so the shared-origin claim can be checked.
 * The STRUCTURAL file, not the architectural one: the pavilion is federated
 * across three files and the floor slabs — the elements this compares extents
 * against — are delivered by structures. All three carry the same site and the
 * same map conversion, which is the point.
 */
const PAVILION_DIR = path.join(process.cwd(), 'public', 'models', 'poblenou')
const PAVILION_FILE = 'BCN-IVO-ZZ-XX-M3-S-0001.ifc'
let pavModel: number
let pavIndex: Map<string, Line[]>

const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''
const num = (v: { value?: unknown } | null | undefined): number =>
  v && typeof v.value === 'number' ? v.value : NaN

const of = (ifcClass: string): Line[] => index.get(ifcClass.toUpperCase()) ?? []
const ofPav = (ifcClass: string): Line[] => pavIndex.get(ifcClass.toUpperCase()) ?? []
const named = (name: string): Line | undefined =>
  [...index.values()].flat().find((l) => str(l.Name) === name)
const namedIn = (idx: Map<string, Line[]>, name: string): Line | undefined =>
  [...idx.values()].flat().find((l) => str(l.Name) === name)

function indexModel(m: number, classSink?: Map<number, string>): Map<string, Line[]> {
  const idx = new Map<string, Line[]>()
  for (const type of api.GetIfcEntityList(m)) {
    const name = api.GetNameFromTypeCode(type).toUpperCase()
    const ids = api.GetLineIDsWithType(m, type)
    const lines: Line[] = []
    for (let i = 0; i < ids.size(); i++) {
      const entity = api.GetLine(m, ids.get(i), false)
      classSink?.set(entity.expressID, name)
      lines.push(entity)
    }
    idx.set(name, (idx.get(name) ?? []).concat(lines))
  }
  return idx
}

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  classOf = new Map()
  model = api.OpenModel(new Uint8Array(readFileSync(path.join(DIR, FILE))))
  index = indexModel(model, classOf)
  pavModel = api.OpenModel(new Uint8Array(readFileSync(path.join(PAVILION_DIR, PAVILION_FILE))))
  pavIndex = indexModel(pavModel)
}, 240_000)

afterAll(() => {
  if (model !== undefined) api?.CloseModel?.(model)
  if (pavModel !== undefined) api?.CloseModel?.(pavModel)
  api?.Dispose?.()
})

// ── Geometry helpers ──────────────────────────────────────────────────────────

type Box = [[number, number], [number, number], [number, number]]

const extents = (expressID: number): Box => extentsIn(model, expressID)

function extentsIn(target: number, expressID: number): Box {
  const mesh = api.GetFlatMesh(target, expressID)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let g = 0; g < mesh.geometries.size(); g++) {
    const placed = mesh.geometries.get(g)
    const m = placed.flatTransformation
    const geom = api.GetGeometry(target, placed.geometryExpressID)
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
    geom.delete()
  }
  return [[lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]]]
}

// ── The file the gallery ships ────────────────────────────────────────────────

describe('the tower the gallery ships', () => {
  it('ships at the size its card promises', () => {
    const demo = DEMO_MODELS.find((m) => m.id === 'torre-poblenou')!
    expect(demo.fileName).toBe(FILE)
    expect(statSync(path.join(DIR, FILE)).size).toBe(demo.sizeBytes)
    expect(demo.ifcUrl.endsWith(FILE)).toBe(true)
    expect(demo.schema).toBe('IFC4')
  })

  it('names its file the way ISO 19650 asks', () => {
    // Project-Originator-Volume-Level-Type-Role-Number. Role Z is the
    // multi-disciplinary one, which is what a single combined file is.
    expect(FILE.split('-').length).toBeGreaterThanOrEqual(6)
    expect(FILE).toMatch(/^BCN-IVO-ZZ-XX-M3-Z-\d{4}\.ifc$/)
  })

  it('contains exactly the population the build reports', () => {
    for (const [ifcClass, count] of Object.entries(POPULATION)) {
      expect(of(ifcClass).length, ifcClass).toBe(count)
    }
  })

  it('gives every element a name', () => {
    // Unnamed elements are the single most common reason a real delivery is
    // rejected, and a reference model must not model the problem.
    for (const ifcClass of Object.keys(POPULATION)) {
      for (const entity of of(ifcClass)) {
        expect(str(entity.Name), `${ifcClass} ${entity.expressID}`).not.toBe('')
      }
    }
  })
})

// ── Georeferencing: the reason it lands on the basemap at all ────────────────

describe('where on earth it says it is', () => {
  it('declares the projected CRS the Catalan survey uses', () => {
    const crs = of('IfcProjectedCRS')[0]
    expect(crs, 'no IfcProjectedCRS').toBeTruthy()
    expect(str(crs.Name)).toBe(EPSG)
  })

  it('places the origin on the shared plot, rotated onto the Cerda grid', () => {
    const conv = of('IfcMapConversion')[0]
    expect(conv, 'no IfcMapConversion').toBeTruthy()
    expect(num(conv.Eastings)).toBeCloseTo(EASTINGS, 3)
    expect(num(conv.Northings)).toBeCloseTo(NORTHINGS, 3)
    expect(num(conv.OrthogonalHeight)).toBeCloseTo(HEIGHT, 3)
    // The axis pair IS the rotation. Getting it wrong puts the building in the
    // right place facing the wrong way, which looks like success.
    const angle = Math.atan2(num(conv.XAxisOrdinate), num(conv.XAxisAbscissa)) * 180 / Math.PI
    expect(angle).toBeCloseTo(ROTATION_DEG, 3)
  })

})

// ── The claim that was wrong once, now asserted across both files ─────────────
//
// The tower first shipped with its OWN eastings and northings one block along,
// on the assumption that the viewer places each model by its own map conversion.
// It does not — every model goes to its own local origin and the basemap is
// anchored to one of them — so the two buildings landed on top of each other
// while every single-file test stayed green. These are the checks that fail if
// that ever comes back.

describe('it federates with the pavilion on one shared origin', () => {
  const conv = () => of('IfcMapConversion')[0]
  const pavConv = () => ofPav('IfcMapConversion')[0]

  it('declares the very same map conversion as the pavilion', () => {
    for (const attr of ['Eastings', 'Northings', 'OrthogonalHeight',
                        'XAxisAbscissa', 'XAxisOrdinate'] as const) {
      expect(num(conv()[attr]), attr).toBeCloseTo(num(pavConv()[attr]), 6)
    }
    expect(str(of('IfcProjectedCRS')[0].Name)).toBe(str(ofPav('IfcProjectedCRS')[0].Name))
  })

  it('puts both buildings on the same site, described the same way', () => {
    const site = of('IfcSite')[0]
    const pavSite = ofPav('IfcSite')[0]
    expect(str(site.Name)).toBe(str(pavSite.Name))
    expect(str(site.LongName)).toBe(str(pavSite.LongName))
    // Latitude/longitude are IfcCompoundPlaneAngleMeasure: ONE value holding a
    // list of [degrees, minutes, seconds, millionths], not a list of values.
    for (const attr of ['RefLatitude', 'RefLongitude'] as const) {
      const dms = (v: { value?: unknown } | null | undefined) =>
        Array.isArray(v?.value) ? (v.value as number[]) : []
      expect(dms(site[attr]), attr).not.toEqual([])
      expect(dms(site[attr]), attr).toEqual(dms(pavSite[attr]))
    }
  })

  it('stands beside the pavilion in the shared system, not on top of it', () => {
    // Project coordinates, not map coordinates — that is what actually decides
    // where the two land relative to each other once both are loaded.
    const tower = extents(named('Floor Slab - Ground')!.expressID)
    const pav = extentsIn(pavModel, namedIn(pavIndex, 'Floor Slab - Ground')!.expressID)

    // The pavilion holds the origin; the tower is offset along +X.
    expect(pav[0][0]).toBeCloseTo(0, 2)
    expect(tower[0][0]).toBeCloseTo(SITE_OFFSET_X, 2)

    // Disjoint in x, with a real street between the two faces.
    const gap = tower[0][0] - pav[0][1]
    expect(gap, 'buildings overlap or touch').toBeGreaterThan(10)
    expect(gap).toBeCloseTo(SITE_OFFSET_X - 36.0, 2)

    // And they share the ground datum, so neither floats above the other.
    expect(tower[2][1]).toBeCloseTo(pav[2][1], 2)
  })
})

// ── The shape, read back from the geometry ───────────────────────────────────

describe('the massing the camera sees', () => {
  it('stacks eighteen storeys at the elevations it declares', () => {
    const storeys = of('IfcBuildingStorey')
    expect(storeys.length).toBe(LEVELS.length)
    for (const [name, elevation] of LEVELS) {
      const storey = storeys.find((s) => str(s.Name) === name)
      expect(storey, `missing storey ${name}`).toBeTruthy()
      expect(num(storey.Elevation), name).toBeCloseTo(elevation, 3)
    }
  })

  it('steps back a bay off BOTH ends of the long axis', () => {
    // This is the silhouette, and the symmetry is the point. The first build
    // stepped one face only: on the elevation facing it the step is a change of
    // depth and reads as nothing, so a 68 m tower looked like a plain slab from
    // the two angles a camera uses most. Stepping both ends is what fixed it —
    // if this ever collapses back to one side, nothing else fails.
    const low = extents(named('Floor Slab - Level 09')!.expressID)
    const high = extents(named('Floor Slab - Level 11')!.expressID)
    expect(low[0][0]).toBeCloseTo(TOWER_A[0], 2)
    expect(low[0][1]).toBeCloseTo(TOWER_A[2], 2)
    expect(high[0][0]).toBeCloseTo(TOWER_B[0], 2)
    expect(high[0][1]).toBeCloseTo(TOWER_B[2], 2)
    expect(high[0][0] - low[0][0], 'west step').toBeCloseTo(7.2, 2)
    expect(low[0][1] - high[0][1], 'east step').toBeCloseTo(7.2, 2)
    // The short faces stay flush, or it is not a setback, it is a taper.
    expect(high[1][0]).toBeCloseTo(low[1][0], 2)
    expect(high[1][1]).toBeCloseTo(low[1][1], 2)
  })

  it('expresses a floor line at every storey', () => {
    // Without this the whole façade is one sheet of glass and the building has
    // no readable height. The spandrel sits at the floor datum, the vision glass
    // stacks on top of it, and the spandrel is DEEPER so it throws a shadow.
    const spandrel = extents(named('Spandrel Panel North 01 - Level 05')!.expressID)
    const glass = extents(named('Glazed Panel North 01 - Level 05')!.expressID)
    // They stack, touching on one plane rather than overlapping.
    expect(glass[2][0]).toBeCloseTo(spandrel[2][1], 3)
    expect(spandrel[2][1] - spandrel[2][0]).toBeCloseTo(SPANDREL_H, 2)
    // And the spandrel stands proud of the glass line.
    const spandrelDepth = spandrel[1][1] - spandrel[1][0]
    const glassDepth = glass[1][1] - glass[1][0]
    expect(spandrelDepth - glassDepth).toBeCloseTo(SPANDREL_PROUD, 2)
    expect(spandrel[1][1]).toBeGreaterThan(glass[1][1])
  })

  it('sits on the podium at the bottom and reaches the mast at the top', () => {
    const ground = extents(named('Floor Slab - Ground')!.expressID)
    expect(ground[0][0]).toBeCloseTo(PODIUM[0], 2)
    expect(ground[0][1]).toBeCloseTo(PODIUM[2], 2)
    expect(ground[1][1]).toBeCloseTo(PODIUM[3], 2)

    const mast = extents(named('Communications Mast')!.expressID)
    expect(mast[2][1]).toBeGreaterThan(80)
    expect(mast[2][1]).toBeLessThan(83)
  })

  it('every floor plate tops out exactly at its level datum', () => {
    for (const [name, elevation] of LEVELS) {
      if (name === 'Foundation') continue
      const label = name === 'Roof' ? 'Roof Slab' : `Floor Slab - ${name}`
      const box = extents(named(label)!.expressID)
      expect(box[2][1], label).toBeCloseTo(elevation, 3)
      expect(box[2][0], label).toBeCloseTo(elevation - SLAB_T, 3)
    }
  })

  it('hangs the fins clear of the SPANDREL line, not just the glass', () => {
    // A fin that intersects the panel it shades renders as z-fighting stripes,
    // which is the sort of thing that only shows up on camera. The spandrel is
    // the outermost part of the façade, so that — not the glass — is what the
    // fins have to clear.
    const spandrel = extents(named('Spandrel Panel North 01 - Level 03')!.expressID)
    const fin = of('IfcMember').map((f) => ({ name: str(f.Name), box: extents(f.expressID) }))
      .find((f) => f.name.startsWith('Shading Fin North') && f.name.endsWith('Tier A'))!
    expect(fin, 'no north fin on tier A').toBeTruthy()
    expect(fin.box[1][0]).toBeGreaterThanOrEqual(spandrel[1][1] - 1e-3)
  })

  it('breaks the setback railing where the tower above lands on it', () => {
    // Six runs: two full sides plus four stubs. Tower B steps back off both
    // ends but spans the full depth, so the north and south edges of the
    // terrace are interrupted. Running them full length would put a balustrade
    // inside the tower.
    const rails = of('IfcRailing').filter((r) => str(r.Name).includes('Level 10'))
    expect(rails.length).toBe(6)
    for (const rail of rails) {
      const box = extents(rail.expressID)
      const name = str(rail.Name)
      // Nothing may sit inside tower B's footprint in x, unless it is one of the
      // two full-height side runs which lie outside it entirely.
      const insideTowerB = box[0][0] > TOWER_B[0] + 1e-2 && box[0][1] < TOWER_B[2] - 1e-2
      expect(insideTowerB, `${name} runs through the tower`).toBe(false)
    }
  })

  it('lays the plaza outside the podium, touching it rather than crossing it', () => {
    for (const side of ['South', 'North', 'West', 'East']) {
      const box = extents(named(`Plaza Paving ${side}`)!.expressID)
      expect(box[2][1], side).toBeCloseTo(0, 3)   // top of the paving is grade
      const insideX = box[0][0] > PODIUM[0] + 1e-3 && box[0][1] < PODIUM[2] - 1e-3
      const insideY = box[1][0] > PODIUM[1] + 1e-3 && box[1][1] < PODIUM[3] - 1e-3
      expect(insideX && insideY, `${side} paving is under the building`).toBe(false)
    }
  })
})

// ── Data, not just shape ──────────────────────────────────────────────────────

describe('the data a checker will read', () => {
  it('puts a material on the occurrence, not only on the type', () => {
    // A bare IfcMaterial on a type is true in the schema and invisible to every
    // take-off tool. Layer sets and profile sets are what reach the occurrence.
    const assignments = of('IfcRelAssociatesMaterial')
    const materialised = new Set<number>()
    for (const rel of assignments) {
      for (const obj of rel.RelatedObjects ?? []) materialised.add(obj.value)
    }
    for (const ifcClass of ['IfcColumn', 'IfcBeam', 'IfcSlab', 'IfcWall', 'IfcPlate', 'IfcMember']) {
      for (const element of of(ifcClass)) {
        expect(materialised.has(element.expressID), `${ifcClass} ${str(element.Name)}`).toBe(true)
      }
    }
  })

  it('classifies every element family it declares a code for', () => {
    const classified = new Set<number>()
    for (const rel of of('IfcRelAssociatesClassification')) {
      for (const obj of rel.RelatedObjects ?? []) classified.add(obj.value)
    }
    for (const ifcClass of ['IfcColumn', 'IfcBeam', 'IfcSlab', 'IfcFooting', 'IfcMember']) {
      for (const element of of(ifcClass)) {
        expect(classified.has(element.expressID), `${ifcClass} ${str(element.Name)}`).toBe(true)
      }
    }
  })

  it('aggregates every glazed panel into a curtain wall', () => {
    // The curtain walls have no body of their own; if the aggregation broke,
    // the façade would still render (the panels do) and the model would quietly
    // stop being able to answer "what is this wall".
    const inWall = new Set<number>()
    for (const rel of of('IfcRelAggregates')) {
      if (classOf.get(rel.RelatingObject.value) !== 'IFCCURTAINWALL') continue
      for (const part of rel.RelatedObjects ?? []) inWall.add(part.value)
    }
    for (const panel of of('IfcPlate')) {
      expect(inWall.has(panel.expressID), str(panel.Name)).toBe(true)
    }
  })

  it('gives every occupied storey a space with real quantities', () => {
    const spaces = of('IfcSpace')
    expect(spaces.length).toBe(LEVELS.length - 2)   // no space at Foundation or Roof
    const quantified = new Set<number>()
    for (const rel of of('IfcRelDefinesByProperties')) {
      const def = api.GetLine(model, rel.RelatingPropertyDefinition.value, false)
      if (!def.expressID || classOf.get(def.expressID) !== 'IFCELEMENTQUANTITY') continue
      for (const obj of rel.RelatedObjects ?? []) quantified.add(obj.value)
    }
    for (const space of spaces) {
      expect(quantified.has(space.expressID), str(space.Name)).toBe(true)
    }
  })
})

// ── The sweep the single-file layout finally makes meaningful ─────────────────

/** "IFCBEAM \"Beam A1-B1 - Level 01\"" → "IFCBEAM Beam" — enough to group by. */
function family(label: string): string {
  const [ifcClass, rest] = label.split(' "')
  return `${ifcClass} ${(rest ?? '').split(/[\s-]/)[0]}`.trim()
}

describe('nothing clashes with anything', () => {
  it('passes the same AABB sweep the app runs', () => {
    const boxes = CLASH_CLASSES.flatMap((c) =>
      of(c).map((e) => ({ name: `${c} "${str(e.Name)}"`, box: extents(e.expressID) })))
    const clashes: string[] = []
    // Grouped by the pair of element FAMILIES involved. With ~1300 elements a
    // flat list of the first eight is useless for diagnosis — every one of them
    // is the same mistake repeated, and what you need to know is which mistake.
    const families = new Map<string, number>()
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlaps = boxes[i].box.every(([lo, hi], a) => {
          const [otherLo, otherHi] = boxes[j].box[a]
          return lo + CLASH_PENETRATION < otherHi && hi - CLASH_PENETRATION > otherLo
        })
        if (!overlaps) continue
        clashes.push(`${boxes[i].name} × ${boxes[j].name}`)
        const key = [family(boxes[i].name), family(boxes[j].name)].sort().join(' × ')
        families.set(key, (families.get(key) ?? 0) + 1)
      }
    }
    const summary = [...families.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}: ${n}`).join('; ')
    expect(clashes.slice(0, 6), `${clashes.length} clashes — ${summary}`).toEqual([])
  }, 300_000)
})
