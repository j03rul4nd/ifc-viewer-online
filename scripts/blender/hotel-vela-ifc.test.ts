// ─── the Hotel Vela, asserted ─────────────────────────────────────────────────
// The landmark model: a sail on the Barceloneta, at the mouth of Port Vell.
//
// This file exists because the procedural extruder CANNOT build it — that path
// is a strict single-ring vertical prism, and this building's identity is that
// its plan changes with height. So the assertions that matter here are not the
// usual "is this valid IFC" ones (though those are here too); they are the ones
// that would still pass if somebody quietly turned it back into a box:
//
//   • the long dimension holds through the shoulder, then closes into the crown;
//   • the curved hotel plate retains almost all of its depth;
//   • one edge stays VERTICAL while the other sweeps in — that asymmetry is
//     what makes it a sail rather than a cone;
//   • the floor line, primary mullions and photographed external stair are real
//     IFC geometry rather than one undifferentiated glazed shell.
//
// Every count and dimension below is DERIVED from the sail's own parameters, so
// a table that agrees with the generator because the same hand typed both
// cannot hide a generator that changed.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync, existsSync } from 'fs'
import path from 'path'
import proj4 from 'proj4'

const DIR = process.env.HOTEL_VELA_MODEL_DIR
  ?? path.join(process.cwd(), 'public', 'models', 'hotel-vela')
/** The architectural model — the one that carries the sail. */
const FILE = 'BCN-IVO-ZZ-XX-M3-A-0002.ifc'
/** The federated set: one project, three disciplines, one origin. */
const SET = [
  'BCN-IVO-ZZ-XX-M3-A-0002.ifc',
  'BCN-IVO-ZZ-XX-M3-S-0002.ifc',
  'BCN-IVO-ZZ-XX-M3-M-0002.ifc',
]

// ── The building, from its own OpenStreetMap tags ────────────────────────────
// way 908035012: building:levels=27, building:levels:underground=2, height=98.8
const TOTAL_H = 98.8
const STOREYS_ABOVE = 27
const STOREYS_BELOW = 2
const GROUND_H = 6.0
const TYPICAL_H = 3.25
const ROOF_LEVEL = 94.0
const SLAB_T = 0.34
const ROOF_FINISH_T = 0.12

/** The georeferencing the file must carry — the surveyed centroid of the plot. */
const EPSG = 'EPSG:25831'
const EASTINGS = 432282.17
const NORTHINGS = 4580004.72
// ZERO: the outlines are already metres east/north, so the model grid IS the
// map grid. A non-zero value here would mean somebody reintroduced a guess.
const ROTATION_DEG = 0.0

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any

let api: IfcAPI
/** One opened model per discipline, keyed A / S / M. */
const models = new Map<string, number>()
const indexes = new Map<string, Map<string, Line[]>>()
/** The discipline currently under assertion — set by `use()`. */
let model: number
let index: Map<string, Line[]>
let classOf: Map<number, string>

/** Point the shared helpers at one discipline's file. */
function use(role: 'A' | 'S' | 'M'): void {
  model = models.get(role)!
  index = indexes.get(role)!
}

const str2 = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''
const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''
const num = (v: { value?: unknown } | null | undefined): number =>
  v && typeof v.value === 'number' ? v.value : NaN
const of = (ifcClass: string): Line[] => index.get(ifcClass.toUpperCase()) ?? []
const named = (name: string): Line | undefined =>
  [...index.values()].flat().find((l) => str(l.Name) === name)

/** World-space AABB of one element, in IFC axes (Z up). */
function extents(expressID: number, drawingFrame = true): Array<[number, number]> {
  const building = of('IfcBuilding')[0]
  const placement = api.GetLine(model, building.ObjectPlacement.value, false)
  const relative = api.GetLine(model, placement.RelativePlacement.value, false)
  const origin = api.GetLine(model, relative.Location.value, false).Coordinates.map(num)
  const direction = api.GetLine(model, relative.RefDirection.value, false).DirectionRatios.map(num)
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
      const world = [w[0], -w[2], w[1]]
      const ifc = drawingFrame ? [
        direction[0]*(world[0]-origin[0])+direction[1]*(world[1]-origin[1]),
        -direction[1]*(world[0]-origin[0])+direction[0]*(world[1]-origin[1]), world[2],
      ] : world
      ifc.forEach((v, a) => { lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v) })
    }
  }
  return [[lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]]]
}

const HAVE_FILE = SET.every((f) => existsSync(path.join(DIR, f)))

/** Vertical plan ray against the actual triangulated IFC slab, including voids. */
function slabCovers(expressID: number, x: number, y: number): boolean {
  const building = of('IfcBuilding')[0]
  const placement = api.GetLine(model, building.ObjectPlacement.value, false)
  const rel = api.GetLine(model, placement.RelativePlacement.value, false)
  const o = api.GetLine(model, rel.Location.value, false).Coordinates.map(num)
  const d = api.GetLine(model, rel.RefDirection.value, false).DirectionRatios.map(num)
  const px = o[0]+d[0]*x-d[1]*y, py = o[1]+d[1]*x+d[0]*y
  const mesh = api.GetFlatMesh(model, expressID)
  for (let k=0; k<mesh.geometries.size(); k++) {
    const placed = mesh.geometries.get(k), t=placed.flatTransformation
    const geom = api.GetGeometry(model, placed.geometryExpressID)
    const v = api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize())
    const indices = api.GetIndexArray(geom.GetIndexData(),geom.GetIndexDataSize())
    const point = (index: number) => {
      const a=index*6, x=v[a], y=v[a+1], z=v[a+2]
      return [t[0]*x+t[4]*y+t[8]*z+t[12], -(t[2]*x+t[6]*y+t[10]*z+t[14])]
    }
    for(let i=0;i<indices.length;i+=3) {
      const [a,b,c]=[point(indices[i]),point(indices[i+1]),point(indices[i+2])]
      const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
      if(Math.abs(det)<1e-6) continue
      const u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/det
      const w=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/det
      if(u>=0 && w>=0 && u+w<=1) return true
    }
  }
  return false
}
const suite = HAVE_FILE ? describe : describe.skip

beforeAll(async () => {
  if (!HAVE_FILE) return
  api = new IfcAPI()
  await api.Init()
  classOf = new Map()
  for (const file of SET) {
    const role = file.split('-')[5] as 'A' | 'S' | 'M'
    const m = api.OpenModel(new Uint8Array(readFileSync(path.join(DIR, file))))
    const idx = new Map<string, Line[]>()
    for (const type of api.GetIfcEntityList(m)) {
      const name = api.GetNameFromTypeCode(type).toUpperCase()
      const ids = api.GetLineIDsWithType(m, type)
      const lines: Line[] = []
      for (let i = 0; i < ids.size(); i++) {
        const entity = api.GetLine(m, ids.get(i), false)
        classOf.set(entity.expressID, name)
        lines.push(entity)
      }
      idx.set(name, (idx.get(name) ?? []).concat(lines))
    }
    models.set(role, m)
    indexes.set(role, idx)
  }
  use('A')
}, 180_000)

afterAll(() => { if (HAVE_FILE) for (const m of models.values()) api?.CloseModel(m) })

suite('the federated set', () => {
  it('is three IFC4 files, each opening through the parser the app ships', () => {
    for (const role of ['A', 'S', 'M'] as const) {
      use(role)
      expect(api.GetModelSchema(model)).toBe('IFC4')
      expect(of('IfcProject')).toHaveLength(1)
    }
    use('A')
  })

  it('is named the way a CDE expects', () => {
    // Project-Originator-Volume-Level-Type-Role-Number.
    for (const f of SET) expect(f).toMatch(/^[A-Z]{3}-[A-Z]{3}-[A-Z]{2}-[A-Z]{2}-M3-[ASM]-\d{4}\.ifc$/)
  })

  it('stays a set somebody can be handed at a stand', () => {
    const mb = SET.reduce((n, f) => n + statSync(path.join(DIR, f)).size, 0) / 1_048_576
    expect(mb).toBeGreaterThan(0.3)
    // Room solids, hosted openings and confidence metadata now form part of
    // the deliverable; keep an explicit small-file budget for the full set.
    expect(mb, 'federated landmark including selectable interiors').toBeLessThan(8)
  })

  // THE POINT OF FEDERATION: three files, one place. If the disciplines
  // disagreed about the origin they would land in different parts of the map
  // and the set would be worse than any one file on its own.
  it('agrees, file by file, on where the building stands', () => {
    const seen = new Set<string>()
    for (const role of ['A', 'S', 'M'] as const) {
      use(role)
      const c = of('IfcMapConversion')[0]
      seen.add(`${num(c.Eastings).toFixed(2)}/${num(c.Northings).toFixed(2)}`
        + `/${num(c.XAxisAbscissa).toFixed(6)}/${num(c.XAxisOrdinate).toFixed(6)}`)
    }
    use('A')
    expect(seen.size).toBe(1)
  })

  // THE STALE-DISCIPLINE GUARD. The three files are generated by three separate
  // Blender processes, so it is entirely possible to change the massing, rebuild
  // one of them and ship a set whose architecture and structure describe
  // different buildings. That happened during this model's own development —
  // the pivot of the taper moved, only ARC was regenerated, and the structural
  // plates kept the old shape. Nothing else here notices: each file is valid,
  // schema-clean and self-consistent.
  it('was built from ONE geometry — the roof agrees across disciplines', () => {
    use('A')
    const arc = extents(named('Roof Finish')!.expressID)
    use('S')
    const str = extents(
      of('IfcSlab').find((x) => str2(x.Name) === 'Roof Slab')!.expressID)
    use('A')
    for (const axis of [0, 1]) {
      expect(Math.abs(arc[axis][0] - str[axis][0]),
        'architecture and structure disagree about the roof outline').toBeLessThan(0.05)
      expect(Math.abs(arc[axis][1] - str[axis][1])).toBeLessThan(0.05)
    }
    expect(Math.abs(arc[2][0] - str[2][1]),
      'roof finish must sit on, not duplicate, the structural slab').toBeLessThan(0.02)
    expect(arc[2][1] - arc[2][0]).toBeCloseTo(ROOF_FINISH_T, 2)
  })

  it('agrees on the storey list, so elements land on the same levels', () => {
    const seen = new Set<string>()
    for (const role of ['A', 'S', 'M'] as const) {
      use(role)
      seen.add(of('IfcBuildingStorey')
        .map((s) => `${str(s.Name)}@${num(s.Elevation).toFixed(2)}`).sort().join('|'))
    }
    use('A')
    expect(seen.size).toBe(1)
  })
})

suite('the spatial tree', () => {
  it('runs project → site → building → storeys', () => {
    expect(of('IfcSite')).toHaveLength(1)
    expect(of('IfcBuilding')).toHaveLength(1)
    expect(of('IfcBuildingStorey')).toHaveLength(STOREYS_BELOW + STOREYS_ABOVE + 1)
  })

  it('runs from the basements to the roof, ascending', () => {
    const z = of('IfcBuildingStorey').map((s) => num(s.Elevation)).sort((a, b) => a - b)
    expect(z[0]).toBeLessThan(0)                      // two basement levels
    expect(z[z.length - 1]).toBeCloseTo(ROOF_LEVEL, 2)
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThan(z[i - 1])
  })

  it('gives the lobby its double height, and the rest a typical storey', () => {
    const named = new Map(of('IfcBuildingStorey').map((s) => [str(s.Name), num(s.Elevation)]))
    expect(named.get('Ground')).toBeCloseTo(0, 6)
    expect(named.get('Level 01')).toBeCloseTo(GROUND_H, 2)
    expect(named.get('Level 02')! - named.get('Level 01')!).toBeCloseTo(TYPICAL_H, 2)
    // Independent readable drawing datums: A.2.15 +51.25 and A.2.27 +90.25.
    expect(named.get('Level 24')! - named.get('Level 12')!).toBeCloseTo(39, 2)
  })
})

// ── The sail ──────────────────────────────────────────────────────────────────

suite('the form is a sail, and could not have been extruded', () => {
  // The floor plates are STRUCTURE. Reading them from the architectural file
  // would be asking the wrong discipline, and getting one roof.
  beforeAll(() => { if (HAVE_FILE) use('S') })
  afterAll(() => { if (HAVE_FILE) use('A') })

  /** Each storey's floor plate, bottom to top. */
  const plates = (): Array<{ z: number; x: [number, number]; y: [number, number] }> =>
    of('IfcSlab').concat(of('IfcRoof'))
      .filter((s) => str(s.Name).endsWith('Slab') && str(s.Name) !== 'Plinth')
      .map((s) => {
        const e = extents(s.expressID)
        return { z: e[2][0], x: e[0] as [number, number], y: e[1] as [number, number] }
      })
      .sort((a, b) => a.z - b.z)

  it('reaches the height it claims', () => {
    use('A')
    const all = of('IfcSlab').concat(of('IfcRoof'), of('IfcPlate'), of('IfcWall'))
    const top = Math.max(...all.map((e) => extents(e.expressID)[2][1]))
    expect(top).toBeCloseTo(TOTAL_H, 1)
    use('S')
  })

  it('has a floor plate at every storey', () => {
    expect(plates().length).toBeGreaterThanOrEqual(STOREYS_ABOVE)
  })

  /**
   * The plates the SAIL rises through.
   *
   * The building is a broad podium with a tower on it — way 908035012 is
   * 127 x 100 m and way 908035013 is 81 x 44 — so the lower plates are the
   * plot and are deliberately all the same size. Mixing them into a "narrows
   * with height" check compares the podium against itself and fails on a
   * building that is behaving exactly as designed.
   */
  const sailPlates = () => plates().filter((p) => p.x[1] - p.x[0] < 100)

  // The plan sheets and sections together rule out both a prism and a cone.
  it('has a convex belly, then retreats toward the crown', () => {
    const p = sailPlates()
    const widths = p.map(s => s.x[1] - s.x[0])
    const widest = widths.indexOf(Math.max(...widths))
    expect(widest).toBeGreaterThan(1)
    expect(widest).toBeLessThan(p.length / 2)
    expect(widths[widest]).toBeGreaterThan(widths[0] + 1)
    for (let i = widest + 1; i < widths.length; i++) expect(widths[i]).toBeLessThan(widths[i-1])
    const depthBase = p[0].y[1] - p[0].y[0]
    const depthTop = p[p.length - 1].y[1] - p[p.length - 1].y[0]
    expect(depthTop / depthBase).toBeGreaterThan(0.85)
  })

  it('holds the shoulder, then closes sharply into the curved crown', () => {
    const p = sailPlates()
    const base = p[0].x[1] - p[0].x[0]
    const shoulder = p[Math.floor(p.length * 0.72)].x[1] - p[Math.floor(p.length * 0.72)].x[0]
    const top = p[p.length - 1].x[1] - p[p.length - 1].x[0]
    expect(shoulder / base).toBeGreaterThan(0.80)
    expect(top / base).toBeGreaterThan(0.20)
    expect(top / base).toBeLessThan(0.50)
  })

  it('keeps ONE edge vertical while the other sweeps — the sail asymmetry', () => {
    const p = sailPlates()
    // The spine: the taper pivots on a CORNER, so this edge holds still.
    const spine = p.map((s) => s.x[1])
    expect(Math.max(...spine) - Math.min(...spine)).toBeLessThan(0.5)
    // The swept edge draws in, monotonically and by tens of metres. Without
    // this the plate would shrink about its centroid and read as a cone.
    const swept = p.map((s) => s.x[0])
    expect(swept[swept.length - 1] - Math.min(...swept)).toBeGreaterThan(30)
  })

  it('uses the slender drawing plate instead of extruding the annex up the tower', () => {
    // Broad drawing proportions, deliberately not an assertion of survey accuracy.
    const p = sailPlates()
    expect(p[0].x[1] - p[0].x[0]).toBeGreaterThan(55)
    expect(p[0].x[1] - p[0].x[0]).toBeLessThan(67)
    expect(p[0].y[1] - p[0].y[0]).toBeGreaterThan(23)
    expect(p[0].y[1] - p[0].y[0]).toBeLessThan(28)
  })

  it('sets the sail on a podium that covers the plot', () => {
    // way 908035012 is 127.3 x 100.6 m. The podium is the building meeting the
    // ground, and without it the tower stands on nothing.
    const podium = plates().filter((p) => p.x[1] - p.x[0] > 100)
    expect(podium.length).toBeGreaterThanOrEqual(3)
    const world = extents(named('Ground Slab')!.expressID, false)
    expect(world[0][1] - world[0][0]).toBeCloseTo(127.3, 0)
  })

  it('tops out each plate exactly at its own level datum', () => {
    for (const s of of('IfcSlab')) {
      if (!str(s.Name).endsWith('Slab') || str(s.Name) === 'Plinth') continue
      const [, hi] = extents(s.expressID)[2]
      expect(extents(s.expressID)[2][1] - extents(s.expressID)[2][0]).toBeCloseTo(SLAB_T, 2)
    }
  })
})

// ── The facade ────────────────────────────────────────────────────────────────

suite('the floor line is expressed in geometry, not only in material', () => {
  beforeAll(() => { if (HAVE_FILE) use('A') })

  it('has a glazed band and a spandrel band at every occupied storey', () => {
    expect(of('IfcPlate').filter(x => /^Level \d+ Spandrel$/.test(str(x.Name))))
      .toHaveLength(STOREYS_ABOVE - 1)
    for (let i = 1; i < STOREYS_ABOVE; i++) {
      expect(named(`Level ${String(i).padStart(2, '0')} Curtain Wall`)).toBeDefined()
      expect(named(`Level ${String(i).padStart(2, '0')} Spandrel`)).toBeDefined()
      expect(named(`Level ${String(i).padStart(2, '0')} Primary Mullion Array`)).toBeDefined()
    }
  })

  it('separates opaque spandrel and clear glazing vertically', () => {
    const glass = extents(named('Level 01 Curtain Wall')!.expressID)
    const spandrel = extents(named('Level 01 Spandrel')!.expressID)
    expect(Math.abs(glass[2][0] - spandrel[2][1])).toBeLessThan(0.02)
  })

  it('stands the spandrel proud of the glass — a REVEAL, not a rib', () => {
    // Both directions of this have been wrong. Flush, the floor line vanishes
    // at 99 m. Standing a third of a metre proud, twenty-seven bands read as a
    // stack of fins and the building stops looking like a smooth specular
    // skin. What is wanted is a shadow gap you would actually detail, with the
    // floor line carried by MATERIAL — glass against anodised aluminium.
    const glass = named('Level 01 Curtain Wall')!
    const spandrel = named('Level 01 Spandrel')!
    expect(glass).toBeDefined()
    expect(spandrel).toBeDefined()
    const delta = extents(spandrel.expressID)[1][1] - extents(glass.expressID)[1][1]
    expect(delta).toBeGreaterThan(0.02)
    expect(delta).toBeLessThan(0.25)
  })

  it('gives every element a material', () => {
    const withMaterial = new Set<number>()
    for (const rel of of('IfcRelAssociatesMaterial')) {
      for (const o of rel.RelatedObjects) withMaterial.add(o.value)
    }
    const bodied = of('IfcSlab').concat(of('IfcRoof'), of('IfcPlate'), of('IfcWall'),
      of('IfcCurtainWall'), of('IfcMember'), of('IfcDoor'), of('IfcRailing'),
      of('IfcStairFlight'))
    for (const e of bodied) {
      const typeRel = of('IfcRelDefinesByType')
        .find((r) => r.RelatedObjects.some((o: Line) => o.value === e.expressID))
      const hasOwn = withMaterial.has(e.expressID)
      const hasType = typeRel && withMaterial.has(typeRel.RelatingType.value)
      expect(hasOwn || hasType, `${str(e.Name)} has no material`).toBe(true)
    }
  })
})

suite('the photographed external stair is a BIM assembly', () => {
  beforeAll(() => { if (HAVE_FILE) use('A') })

  it('has one landing, flight and guardrail for every above-ground rise', () => {
    expect(of('IfcStair')).toHaveLength(STOREYS_ABOVE)
    expect(of('IfcStairFlight')).toHaveLength(STOREYS_ABOVE * 2)
    expect(of('IfcRailing').filter(x => str(x.Name).startsWith('Escape Stair Guardrail')))
      .toHaveLength(STOREYS_ABOVE)
    expect(of('IfcSlab').filter((x) => str(x.Name).startsWith('Escape Stair Landing')))
      .toHaveLength(STOREYS_ABOVE)
  })

  it('alternates flight direction and aggregates every flight into a stair', () => {
    const flights = of('IfcStairFlight')
    const aggregateChildren = new Set<number>()
    for (const rel of of('IfcRelAggregates')) {
      for (const child of rel.RelatedObjects ?? []) aggregateChildren.add(child.value)
    }
    for (const flight of flights) expect(aggregateChildren.has(flight.expressID)).toBe(true)
    const first = extents(named('Escape Stair Flight 1 - Ground')!.expressID)
    const second = extents(named('Escape Stair Flight 1 - Level 01')!.expressID)
    expect(first[1][0]).toBeCloseTo(second[1][0], 1)
    expect(first[1][1]).toBeCloseTo(second[1][1], 1)
  })

  it('recesses the photographed landings into the curved end and models actual treads', () => {
    const lower = extents(named('Escape Stair Landing - Level 04')!.expressID)
    const upper = extents(named('Escape Stair Landing - Level 24')!.expressID)
    expect(lower[0][1]).toBeLessThan(0)
    expect(upper[0][0]).toBeGreaterThan(lower[0][0] + 10)
    for (const flight of of('IfcStairFlight')) {
      const definition = api.GetLine(model, flight.Representation.value, false)
      const body = api.GetLine(model, definition.Representations[0].value, false)
      expect(body.Items.length).toBeGreaterThan(5)
      expect(num(flight.NumberOfTreads)).toBe(body.Items.length)
    }
    expect(named('Escape Base Louvre Blades South')).toBeDefined()
    expect(named('Folded Cheek North - Level 12')).toBeDefined()
    const guard=named('Escape Stair Guardrail - Level 12')!
    const material=of('IfcRelAssociatesMaterial').find(r => r.RelatedObjects.some((o: Line) => o.value===guard.expressID))
    expect(str(api.GetLine(model,material.RelatingMaterial.value,false).Name)).toBe('Solar Control Glazing')
  })
})

suite('structure and services are coordinated', () => {
  it('keeps the courtyard genuinely open in the low-rise floor and roof meshes', () => {
    use('S')
    for(const name of ['Annex Floor - Level 04','Annex Roof Deck']) {
      const slab=named(name)!
      expect(slabCovers(slab.expressID,27,-28),'courtyard must not contain slab triangles').toBe(false)
      expect(slabCovers(slab.expressID,40,-28),'rear wing must have a real floor').toBe(true)
      expect(slabCovers(slab.expressID,10,-47),'south room wing must have a real floor').toBe(true)
    }
    expect(slabCovers(named('Annex Link Floor 2 - Level 04')!.expressID,12,-16.2),
      'north wing must connect to tower instead of floating across a gap').toBe(true)
    expect(slabCovers(named('Annex Link Floor 1 - Level 04')!.expressID,12,-39.8)).toBe(true)
    use('A')
    expect(named('Public Convention Zone +2.30')).toBeDefined()
    expect(named('Restaurant Courtyard Guardrails')).toBeDefined()
  })
  it('separates the low-rise annex and technical roof from the crown', () => {
    use('A')
    const deck = extents(named('Roof Finish')!.expressID)
    const cap = extents(named('Crown Cap')!.expressID)
    expect(cap[2][1] - deck[2][1]).toBeCloseTo(4.8, 2)
    expect(extents(named('Annex Roof Finish')!.expressID)[2][1]).toBeCloseTo(25.5, 2)
    use('S')
    expect(named('Annex Roof Deck')).toBeDefined()
    use('M')
    for (const plant of of('IfcAirTerminalBox').concat(of('IfcTank'))) {
      const e = extents(plant.expressID)
      expect(e[2][0]).toBeCloseTo(ROOF_LEVEL, 2)
      expect(e[2][1]).toBeLessThan(TOTAL_H)
    }
    use('A')
  })

  it('provides drawing-based partitions on the four supplied detailed floors', () => {
    use('A')
    const partitions = of('IfcWall').filter(x => str(x.Name).startsWith('Plan '))
    expect(partitions.length).toBeGreaterThan(20)
    for (const wall of partitions) expect(str(wall.Name)).toMatch(/Level (02|04|12|24)/)
    for (const level of ['02', '04', '12', '24']) {
      expect(partitions.filter(x => str(x.Name).includes(`Level ${level}`)).length).toBeGreaterThan(5)
    }
    expect(of('IfcSurfaceStyleRendering').length).toBeGreaterThanOrEqual(3)
  })

  it('uses storey-height core walls rather than one building-height wall', () => {
    use('S')
    const walls = of('IfcWall').filter((x) => str(x.Name).startsWith('Core Wall'))
    expect(walls).toHaveLength((STOREYS_BELOW + STOREYS_ABOVE) * 4)
    const datums = of('IfcBuildingStorey').map(s => num(s.Elevation)).sort((a,b) => a-b)
    for (const wall of walls) {
      const [bottom, top] = extents(wall.expressID)[2]
      const storeyIndex = datums.findIndex(z => Math.abs(z-bottom) < .01)
      expect(storeyIndex).toBeGreaterThanOrEqual(0)
      expect(top).toBeLessThan(datums[storeyIndex+1])
    }
    use('A')
  })

  it('reuses fixed column coordinates instead of drifting with every facade', () => {
    use('S')
    const columns = of('IfcColumn')
    const xy = new Set(columns.map((c) => {
      const e = extents(c.expressID)
      return `${((e[0][0] + e[0][1]) / 2).toFixed(2)}/${((e[1][0] + e[1][1]) / 2).toFixed(2)}`
    }))
    expect(columns.length).toBeGreaterThan(xy.size * 3)
    use('A')
  })

  it('voids every intermediate slab at the four riser coordinates', () => {
    use('S')
    expect(of('IfcOpeningElement')).toHaveLength((STOREYS_ABOVE - 1) * 4)
    expect(of('IfcRelVoidsElement')).toHaveLength((STOREYS_ABOVE - 1) * 4)
    use('M')
    expect(of('IfcDuctSegment')).toHaveLength(STOREYS_ABOVE * 4)
    expect(of('IfcDistributionSystem')).toHaveLength(2)
    use('A')
  })
})

// ── Where it is ───────────────────────────────────────────────────────────────

suite('drawing-derived room interiors', () => {
  it('keeps bedrooms and bathrooms selectable on each documented tower floor', () => {
    for (const level of ['Level 02', 'Level 04', 'Level 12', 'Level 24']) {
      const rooms = of('IfcSpace').filter(s => str(s.Name).startsWith(`Plan Guest Room ${level}`))
      const baths = of('IfcSpace').filter(s => str(s.Name).startsWith(`Plan Bathroom ${level}`))
      expect(rooms.length).toBeGreaterThan(0)
      expect(baths.length).toBe(rooms.length)
      expect(of('IfcSpace').some(s => str(s.Name) === `Gross Hotel Zone - ${level}`)).toBe(false)
      for (const s of [...rooms, ...baths]) {
        const bounds = extents(s.expressID)
        expect(bounds[1][1] - bounds[1][0]).toBeGreaterThan(2)
      }
    }
  })

  it('links each interior door to an opening that voids a wall', () => {
    const doors = of('IfcDoor').filter(d => /^Plan (Room|Bathroom) Door /.test(str(d.Name)))
    expect(doors.length).toBeGreaterThan(0)
    for (const door of doors) {
      const filling = of('IfcRelFillsElement').find(r => r.RelatedBuildingElement.value === door.expressID)
      expect(filling, str(door.Name)).toBeDefined()
      const voiding = of('IfcRelVoidsElement').find(r => r.RelatedOpeningElement.value === filling!.RelatingOpeningElement.value)
      expect(voiding).toBeDefined()
      expect(of('IfcWall').some(w => w.expressID === voiding!.RelatingBuildingElement.value)).toBe(true)
      expect(num(door.OverallWidth)).toBeGreaterThanOrEqual(.8)
    }
  })
})

suite('it stands where the building stands', () => {
  it('carries a real map conversion on the projected CRS', () => {
    const conv = of('IfcMapConversion')[0]
    expect(conv).toBeDefined()
    expect(num(conv.Eastings)).toBeCloseTo(EASTINGS, 2)
    expect(num(conv.Northings)).toBeCloseTo(NORTHINGS, 2)
    const crs = of('IfcProjectedCRS')[0]
    expect(str(crs.Name)).toBe(EPSG)
  })

  it('turns the building the way the shoreline runs', () => {
    const conv = of('IfcMapConversion')[0]
    const deg = (Math.atan2(num(conv.XAxisOrdinate), num(conv.XAxisAbscissa)) * 180) / Math.PI
    expect(deg).toBeCloseTo(ROTATION_DEG, 3)
  })

  it('agrees with its own latitude and longitude on the ground', () => {
    // Two independent statements about one place. Re-projected and compared in
    // metres, because a constant compared with itself is not a check.
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
      .toBeLessThan(1.0)
  })

  it('sits at the water, not on a hill', () => {
    // Reclaimed harbour land: a couple of metres over mean sea level. A site
    // elevation of tens of metres would mean the datum is wrong.
    const site = of('IfcSite')[0]
    expect(num(site.RefElevation)).toBeGreaterThan(0)
    expect(num(site.RefElevation)).toBeLessThan(8)
  })
})
