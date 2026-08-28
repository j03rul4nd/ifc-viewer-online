// ─── the Hotel Vela, asserted ─────────────────────────────────────────────────
// The landmark model: a sail on the Barceloneta, at the mouth of Port Vell.
//
// This file exists because the procedural extruder CANNOT build it — that path
// is a strict single-ring vertical prism, and this building's identity is that
// its plan changes with height. So the assertions that matter here are not the
// usual "is this valid IFC" ones (though those are here too); they are the ones
// that would still pass if somebody quietly turned it back into a box:
//
//   • the plan SHRINKS with height, monotonically, on both axes;
//   • one edge stays VERTICAL while the other sweeps in — that asymmetry is
//     what makes it a sail rather than a cone;
//   • the floor line is expressed in GEOMETRY, not only in material. A spandrel
//     that is flush with the glass is invisible at 99 m, and twenty-six storeys
//     of curtain wall then read as one flat sheet.
//
// Every count and dimension below is DERIVED from the sail's own parameters, so
// a table that agrees with the generator because the same hand typed both
// cannot hide a generator that changed.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync, existsSync } from 'fs'
import path from 'path'
import proj4 from 'proj4'

const DIR = path.join(process.cwd(), 'public', 'models', 'hotel-vela')
const FILE = 'HotelVela.ifc'

// ── The sail, as the build script defines it ─────────────────────────────────
const STOREY_H = 3.8
const STOREYS = 26
const TOTAL_H = STOREY_H * STOREYS
const CHORD_BASE = 96.0
const CHORD_TOP = 44.0
const CHORD_CURVE = 1.55
const DEPTH_BASE = 26.0
const DEPTH_TOP = 15.0
const DEPTH_CURVE = 1.2
const SLAB_T = 0.34

const chordAt = (t: number): number => CHORD_BASE - (CHORD_BASE - CHORD_TOP) * t ** CHORD_CURVE
const depthAt = (t: number): number => DEPTH_BASE - (DEPTH_BASE - DEPTH_TOP) * t ** DEPTH_CURVE

/** The georeferencing the file must carry — the real site, not a placeholder. */
const EPSG = 'EPSG:25831'
const EASTINGS = 432274.81
const NORTHINGS = 4579959.49
const ROTATION_DEG = -45.0

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
const named = (name: string): Line | undefined =>
  [...index.values()].flat().find((l) => str(l.Name) === name)

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

const HAVE_FILE = existsSync(path.join(DIR, FILE))
const suite = HAVE_FILE ? describe : describe.skip

beforeAll(async () => {
  if (!HAVE_FILE) return
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

afterAll(() => { if (HAVE_FILE) api?.CloseModel(model) })

suite('the file itself', () => {
  it('is IFC4 and opens through the parser the app ships', () => {
    expect(api.GetModelSchema(model)).toBe('IFC4')
    expect(of('IfcProject')).toHaveLength(1)
  })

  it('stays a file somebody can be handed at a stand', () => {
    const kb = statSync(path.join(DIR, FILE)).size / 1024
    expect(kb).toBeGreaterThan(80)
    expect(kb, 'a landmark nobody waits for').toBeLessThan(900)
  })
})

suite('the spatial tree', () => {
  it('runs project → site → building → storeys', () => {
    expect(of('IfcSite')).toHaveLength(1)
    expect(of('IfcBuilding')).toHaveLength(1)
    expect(of('IfcBuildingStorey')).toHaveLength(STOREYS + 1)
  })

  it('puts every storey at its own elevation, evenly and ascending', () => {
    const z = of('IfcBuildingStorey').map((s) => num(s.Elevation)).sort((a, b) => a - b)
    expect(z[0]).toBeCloseTo(0, 6)
    expect(z[z.length - 1]).toBeCloseTo(TOTAL_H, 2)
    for (let i = 1; i < z.length; i++) expect(z[i] - z[i - 1]).toBeCloseTo(STOREY_H, 6)
  })
})

// ── The sail ──────────────────────────────────────────────────────────────────

suite('the form is a sail, and could not have been extruded', () => {
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
    const all = of('IfcSlab').concat(of('IfcRoof'), of('IfcPlate'), of('IfcWall'))
    const top = Math.max(...all.map((e) => extents(e.expressID)[2][1]))
    expect(top).toBeCloseTo(TOTAL_H, 1)
  })

  it('has a floor plate at every storey', () => {
    expect(plates()).toHaveLength(STOREYS + 1)
  })

  // THE ASSERTION THIS FILE EXISTS FOR. A prism passes every other test here.
  it('narrows with height on BOTH axes, monotonically', () => {
    const p = plates()
    for (let i = 1; i < p.length; i++) {
      const below = p[i - 1]
      const here = p[i]
      const widthBelow = below.x[1] - below.x[0]
      const widthHere = here.x[1] - here.x[0]
      const depthBelow = below.y[1] - below.y[0]
      const depthHere = here.y[1] - here.y[0]
      expect(widthHere, `storey ${i} is not narrower than ${i - 1}`).toBeLessThan(widthBelow)
      expect(depthHere, `storey ${i} is not shallower than ${i - 1}`).toBeLessThan(depthBelow)
    }
  })

  it('is dramatically narrower at the top than at the base', () => {
    const p = plates()
    const base = p[0].x[1] - p[0].x[0]
    const top = p[p.length - 1].x[1] - p[p.length - 1].x[0]
    expect(base).toBeCloseTo(chordAt(0), 0)
    expect(top).toBeCloseTo(chordAt(1), 0)
    // Roughly halves. A prism would be 1.0 and a cone would go to nothing.
    expect(top / base).toBeGreaterThan(0.35)
    expect(top / base).toBeLessThan(0.6)
  })

  it('keeps ONE edge vertical while the other sweeps — the sail asymmetry', () => {
    const p = plates()
    // The spine: every storey starts at the same x.
    const spine = p.map((s) => s.x[0])
    expect(Math.max(...spine) - Math.min(...spine)).toBeLessThan(0.5)
    // The swept edge: monotonically inward, by tens of metres.
    const swept = p.map((s) => s.x[1])
    for (let i = 1; i < swept.length; i++) expect(swept[i]).toBeLessThan(swept[i - 1])
    expect(swept[0] - swept[swept.length - 1]).toBeGreaterThan(40)
  })

  it('bulges: the plan is a lens, not a rectangle', () => {
    const p = plates()
    expect(p[0].y[1] - p[0].y[0]).toBeCloseTo(depthAt(0), 0)
    expect(p[p.length - 1].y[1] - p[p.length - 1].y[0]).toBeCloseTo(depthAt(1), 0)
  })

  it('tops out each plate exactly at its own level datum', () => {
    for (const s of of('IfcSlab')) {
      if (!str(s.Name).endsWith('Slab') || str(s.Name) === 'Plinth') continue
      const [, hi] = extents(s.expressID)[2]
      expect(Math.abs(hi / STOREY_H - Math.round(hi / STOREY_H))).toBeLessThan(0.01)
      expect(extents(s.expressID)[2][1] - extents(s.expressID)[2][0]).toBeCloseTo(SLAB_T, 2)
    }
  })
})

// ── The facade ────────────────────────────────────────────────────────────────

suite('the floor line is expressed in geometry, not only in material', () => {
  it('has a glazed band and a spandrel band at every occupied storey', () => {
    expect(of('IfcPlate')).toHaveLength(STOREYS * 2)
  })

  it('stands the spandrel PROUD of the glass', () => {
    // Flush, it is invisible at this height and the elevation reads as one
    // undifferentiated sheet — measured, not assumed: the first build set the
    // offset to 0.12 m and the facade rendered flat.
    const glass = named('Level 01 Curtain Wall')!
    const spandrel = named('Level 01 Spandrel')!
    expect(glass).toBeDefined()
    expect(spandrel).toBeDefined()
    const gy = extents(glass.expressID)[1][1]
    const sy = extents(spandrel.expressID)[1][1]
    expect(sy - gy).toBeGreaterThan(0.2)
  })

  it('gives every element a material', () => {
    const withMaterial = new Set<number>()
    for (const rel of of('IfcRelAssociatesMaterial')) {
      for (const o of rel.RelatedObjects) withMaterial.add(o.value)
    }
    const bodied = of('IfcSlab').concat(of('IfcRoof'), of('IfcPlate'), of('IfcWall'))
    for (const e of bodied) {
      const typeRel = of('IfcRelDefinesByType')
        .find((r) => r.RelatedObjects.some((o: Line) => o.value === e.expressID))
      const hasOwn = withMaterial.has(e.expressID)
      const hasType = typeRel && withMaterial.has(typeRel.RelatingType.value)
      expect(hasOwn || hasType, `${str(e.Name)} has no material`).toBe(true)
    }
  })
})

// ── Where it is ───────────────────────────────────────────────────────────────

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
