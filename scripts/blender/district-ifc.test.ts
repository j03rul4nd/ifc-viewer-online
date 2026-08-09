// ─── the federated reference project, asserted ────────────────────────────────
// The Poblenou Pavilion is three IFC files and one point cloud that all claim to
// be the same place. Everything below exists to check that they still are.
//
// This is a different kind of test from the other two fixtures. Hello World and
// the temple are single files, and a single file is either right or wrong on its
// own. A federated set can be perfectly valid file by file and still useless:
// three models that each pass every rule but sit 40 m apart, or a scan that
// declares a CRS the models do not use. Those are the failures with no symptom
// short of loading all four and looking, which is exactly the kind nobody
// notices for a release.
//
// So the checks are: each file is internally clean (as before), AND the four
// agree — same projected CRS, same origin, same rotation, and scan points that
// land on modelled surfaces.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { DEMO_MODELS } from '../../src/demo-models/models'

const DIR = path.join(process.cwd(), 'public', 'models', 'poblenou')
const FILES = {
  ARC: 'BCN-IVO-ZZ-XX-M3-A-0001.ifc',
  STR: 'BCN-IVO-ZZ-XX-M3-S-0001.ifc',
  MEP: 'BCN-IVO-ZZ-XX-M3-M-0001.ifc',
}
const SCAN = 'poblenou-site-scan.las'

/** The georeferencing all four files must agree on. */
const EPSG = 'EPSG:25831'
const EASTINGS = 432340.0
const NORTHINGS = 4583945.0
const HEIGHT = 12.5
const ROTATION_DEG = 45

/** Storeys, and the elevation each must sit at. */
const LEVELS: Array<[string, number]> = [
  ['Foundation', -1.2],
  ['Ground', 0.0],
  ['Level 01', 4.2],
  ['Level 02', 8.4],
  ['Roof', 12.6],
]

/** What each discipline owns — and, just as importantly, what it does not. */
const POPULATION: Record<string, Record<string, number>> = {
  STR: { IfcFooting: 24, IfcColumn: 72, IfcBeam: 114, IfcSlab: 4 },
  ARC: {
    IfcCurtainWall: 12, IfcPlate: 102, IfcWall: 16, IfcDoor: 3,
    IfcStair: 3, IfcStairFlight: 3, IfcRoof: 1, IfcRailing: 4, IfcSpace: 3,
  },
  MEP: {
    IfcDuctSegment: 3, IfcDuctFitting: 6, IfcAirTerminal: 18, IfcUnitaryEquipment: 1,
  },
}

/** Classes the app's clash rule sweeps, and the penetration it reports at. */
const CLASH_CLASSES = ['IFCWALL', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCROOF', 'IFCMEMBER',
                       'IFCPLATE', 'IFCFOOTING', 'IFCPILE']
const CLASH_PENETRATION = 0.05

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any

interface Loaded {
  model: number
  index: Map<string, Line[]>
  classOf: Map<number, string>
}

let api: IfcAPI
const loaded: Record<string, Loaded> = {}

const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''

function of(disc: string, ifcClass: string): Line[] {
  return loaded[disc].index.get(ifcClass.toUpperCase()) ?? []
}
const line = (disc: string, id: number): Line => api.GetLine(loaded[disc].model, id, false)
const deep = (disc: string, id: number): Line => api.GetLine(loaded[disc].model, id, true)
const named = (disc: string, name: string): Line | undefined =>
  [...loaded[disc].index.values()].flat().find((l) => str(l.Name) === name)

/** Everything in a discipline that POPULATION says should be there. */
function products(disc: string): Line[] {
  return Object.keys(POPULATION[disc])
    .filter((c) => c !== 'IfcSpace')
    .flatMap((c) => of(disc, c))
}

/**
 * The subset with a body of its own. IfcCurtainWall and IfcStair are decomposed
 * elements: their geometry lives in their panels and flights, so GetFlatMesh
 * rightly returns nothing for them.
 */
const BODILESS = new Set(['IFCCURTAINWALL', 'IFCSTAIR'])
function solids(disc: string): Line[] {
  return products(disc).filter((e) => !BODILESS.has(loaded[disc].classOf.get(e.expressID) ?? ''))
}

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  for (const [disc, file] of Object.entries(FILES)) {
    const model = api.OpenModel(new Uint8Array(readFileSync(path.join(DIR, file))))
    const index = new Map<string, Line[]>()
    const classOf = new Map<number, string>()
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
    loaded[disc] = { model, index, classOf }
  }
}, 120_000)

afterAll(() => {
  for (const { model } of Object.values(loaded)) api?.CloseModel?.(model)
  api?.Dispose?.()
})

describe('the federated set the gallery ships', () => {
  it('ships each discipline at the size its card promises', () => {
    for (const [id, file] of [['poblenou-arc', FILES.ARC], ['poblenou-str', FILES.STR],
                              ['poblenou-mep', FILES.MEP]] as const) {
      const demo = DEMO_MODELS.find((m) => m.id === id)!
      expect(demo.fileName, id).toBe(file)
      expect(statSync(path.join(DIR, file)).size, id).toBe(demo.sizeBytes)
      expect(demo.ifcUrl.endsWith(file), id).toBe(true)
      expect(demo.schema, id).toBe('IFC4')
    }
  })

  it('names its files the way ISO 19650 asks', () => {
    // Project-Originator-Volume-Level-Type-Role-Number: at least five fields.
    // The app's own filename rule wants the same shape, and a CDE will reject
    // a delivery that does not have it.
    for (const file of Object.values(FILES)) {
      expect(file.split('-').length, file).toBeGreaterThanOrEqual(6)
      expect(file, file).toMatch(/^BCN-IVO-ZZ-XX-M3-[ASM]-\d{4}\.ifc$/)
    }
  })

  it('divides the building up without modelling anything twice', () => {
    for (const [disc, expected] of Object.entries(POPULATION)) {
      for (const [ifcClass, count] of Object.entries(expected)) {
        expect(of(disc, ifcClass).length, `${disc} ${ifcClass}`).toBe(count)
      }
    }
    // The frame belongs to STR alone, the envelope to ARC alone. If a slab ever
    // appears in both, the federated model has two slabs at one elevation and
    // every quantity taken off it is double.
    expect(of('ARC', 'IfcSlab')).toHaveLength(0)
    expect(of('ARC', 'IfcColumn')).toHaveLength(0)
    expect(of('STR', 'IfcCurtainWall')).toHaveLength(0)
    expect(of('STR', 'IfcSpace')).toHaveLength(0)
    expect(of('MEP', 'IfcWall')).toHaveLength(0)
  })
})

describe('the three models agree about where they are', () => {
  function conversion(disc: string): Line {
    const conversions = of(disc, 'IfcMapConversion')
    expect(conversions, `${disc} has no IfcMapConversion`).toHaveLength(1)
    return conversions[0]
  }

  it('carries full georeferencing, not just a latitude', () => {
    for (const disc of Object.keys(FILES)) {
      const crs = of(disc, 'IfcProjectedCRS')
      expect(crs, `${disc} IfcProjectedCRS`).toHaveLength(1)
      expect(str(crs[0].Name), disc).toBe(EPSG)
      expect(str(crs[0].GeodeticDatum), disc).toBe('ETRS89')
    }
  })

  it('puts all three on the same origin, to the millimetre', () => {
    for (const disc of Object.keys(FILES)) {
      const c = conversion(disc)
      expect(c.Eastings.value, disc).toBeCloseTo(EASTINGS, 3)
      expect(c.Northings.value, disc).toBeCloseTo(NORTHINGS, 3)
      expect(c.OrthogonalHeight.value, disc).toBeCloseTo(HEIGHT, 3)
    }
  })

  it('turns all three the same way — the Cerdà grid, not north', () => {
    // The failure this catches has no symptom in a single file: a model with the
    // right coordinates and no rotation lands on the map square to north, which
    // looks plausible until you notice every street around it disagrees.
    for (const disc of Object.keys(FILES)) {
      const c = conversion(disc)
      const degrees = (Math.atan2(c.XAxisOrdinate.value, c.XAxisAbscissa.value) * 180) / Math.PI
      expect(degrees, disc).toBeCloseTo(ROTATION_DEG, 6)
      expect(c.Scale?.value ?? 1, disc).toBeCloseTo(1, 9)
    }
  })

  it('agrees between its map conversion and its site latitude', () => {
    // Two georeferencing statements that disagree are worse than one, because
    // whichever rung a consumer happens to read decides where the model goes.
    for (const disc of Object.keys(FILES)) {
      const site = of(disc, 'IfcSite')[0]
      const angle = (v: Line): number[] =>
        (Array.isArray(v) ? v : v.value).map((n: Line) => (typeof n === 'number' ? n : n.value))
      const toDegrees = (parts: number[]): number =>
        parts[0] + parts[1] / 60 + parts[2] / 3600 + (parts[3] ?? 0) / 3.6e9
      // Poblenou: 41.4042 N, 2.1905 E, within a metre of the grid coordinates.
      expect(toDegrees(angle(site.RefLatitude)), disc).toBeCloseTo(41.4043, 3)
      expect(toDegrees(angle(site.RefLongitude)), disc).toBeCloseTo(2.1907, 3)
      expect(site.RefElevation.value, disc).toBeCloseTo(HEIGHT, 3)
    }
  })

  it('stacks the same five storeys at the same elevations in every discipline', () => {
    for (const disc of Object.keys(FILES)) {
      const storeys = of(disc, 'IfcBuildingStorey')
        .map((s) => [str(s.Name), s.Elevation.value] as [string, number])
        .sort((a, b) => a[1] - b[1])
      expect(storeys, disc).toEqual(LEVELS)
    }
  })
})

describe('data every element carries', () => {
  function relatedTo(disc: string, relClass: string, attribute: string): Set<number> {
    const out = new Set<number>()
    for (const rel of of(disc, relClass)) {
      for (const o of rel[attribute] ?? []) out.add(o.value)
    }
    return out
  }

  it('names, describes, types, classifies and costs out every element', () => {
    for (const disc of Object.keys(FILES)) {
      const typed = relatedTo(disc, 'IfcRelDefinesByType', 'RelatedObjects')
      const material = relatedTo(disc, 'IfcRelAssociatesMaterial', 'RelatedObjects')
      const classified = relatedTo(disc, 'IfcRelAssociatesClassification', 'RelatedObjects')

      const sets = new Map<number, string[]>()
      for (const rel of of(disc, 'IfcRelDefinesByProperties')) {
        const definition = deep(disc, rel.RelatingPropertyDefinition.value)
        for (const o of rel.RelatedObjects) {
          sets.set(o.value, (sets.get(o.value) ?? []).concat(str(definition.Name)))
        }
      }

      for (const element of products(disc)) {
        const where = `${disc} ${str(element.Name)}`
        expect(str(element.Name), where).not.toBe('')
        expect(str(element.Description), where).not.toBe('')
        expect(typed.has(element.expressID), `${where}: no type`).toBe(true)
        expect(material.has(element.expressID), `${where}: no material`).toBe(true)
        expect(classified.has(element.expressID), `${where}: unclassified`).toBe(true)
        const owned = sets.get(element.expressID) ?? []
        expect(owned.some((n) => n.startsWith('Pset_')), `${where}: no Pset`).toBe(true)
        expect(owned.some((n) => n.startsWith('Qto_')), `${where}: no Qto`).toBe(true)
      }
    }
  })

  it('gives every element a unique, well-formed GlobalId inside its own file', () => {
    for (const disc of Object.keys(FILES)) {
      const guids = [...loaded[disc].index.values()].flat()
        .filter((l) => l.GlobalId).map((l) => str(l.GlobalId))
      for (const guid of guids) expect(guid, `${disc} ${guid}`).toMatch(/^[0-9A-Za-z_$]{22}$/)
      expect(new Set(guids).size, disc).toBe(guids.length)
    }
  })

  it('decomposes each curtain wall into the panels that are actually there', () => {
    const parts = new Map<number, number[]>()
    for (const rel of of('ARC', 'IfcRelAggregates')) {
      parts.set(rel.RelatingObject.value, rel.RelatedObjects.map((o: Line) => o.value))
    }
    for (const wall of of('ARC', 'IfcCurtainWall')) {
      const panels = parts.get(wall.expressID) ?? []
      expect(panels.length, str(wall.Name)).toBeGreaterThanOrEqual(6)
      for (const id of panels) {
        expect(loaded.ARC.classOf.get(id), str(wall.Name)).toBe('IFCPLATE')
      }
    }
  })

  it('puts every service element in a system, with connected ports', () => {
    const systems = of('MEP', 'IfcDistributionSystem')
    expect(systems).toHaveLength(1)
    const assigned = new Set<number>()
    for (const rel of of('MEP', 'IfcRelAssignsToGroup')) {
      for (const o of rel.RelatedObjects) assigned.add(o.value)
    }
    for (const element of products('MEP')) {
      expect(assigned.has(element.expressID), `${str(element.Name)} is in no system`).toBe(true)
    }

    // IFC4 NESTS ports under their element (IfcRelConnectsPortToElement is
    // deprecated). Every duct segment must have one, or it is a box that
    // happens to be duct-shaped.
    const ports = new Set(of('MEP', 'IfcDistributionPort').map((p) => p.expressID))
    const hosts = new Set<number>()
    for (const rel of of('MEP', 'IfcRelNests')) {
      if (rel.RelatedObjects.some((o: Line) => ports.has(o.value))) hosts.add(rel.RelatingObject.value)
    }
    for (const segment of of('MEP', 'IfcDuctSegment')) {
      expect(hosts.has(segment.expressID), `${str(segment.Name)} has no port`).toBe(true)
    }
    expect(of('MEP', 'IfcRelConnectsPorts').length).toBeGreaterThanOrEqual(6)
  })
})

describe('the geometry the viewer actually gets', () => {
  function extents(disc: string, expressID: number): [[number, number], [number, number], [number, number]] {
    const mesh = api.GetFlatMesh(loaded[disc].model, expressID)
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (let g = 0; g < mesh.geometries.size(); g++) {
      const placed = mesh.geometries.get(g)
      const m = placed.flatTransformation
      const geom = api.GetGeometry(loaded[disc].model, placed.geometryExpressID)
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
    expect(lo[0], 'no triangles at all').not.toBe(Infinity)
    return [[lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]]]
  }

  it('builds the frame on the grid the drawings say', () => {
    const check = (disc: string, name: string, want: number[][], tolerance = 0.002) => {
      extents(disc, named(disc, name)!.expressID).forEach(([lo, hi], a) => {
        expect(Math.abs(lo - want[a][0]), `${name} min ${'xyz'[a]} = ${lo}`).toBeLessThan(tolerance)
        expect(Math.abs(hi - want[a][1]), `${name} max ${'xyz'[a]} = ${hi}`).toBeLessThan(tolerance)
      })
    }
    check('STR', 'Pad Footing A1', [[-1.0, 1.0], [-1.0, 1.0], [-1.2, -0.3]])
    check('STR', 'Floor Slab - Level 01', [[0, 36.0], [0, 21.6], [3.9, 4.2]])
    check('STR', 'Column A1 - Ground', [[-0.2, 0.2], [-0.2, 0.2], [0.0, 3.3]])
    // Swept along its own axis: 6.8 m of beam between two 400 mm columns.
    check('STR', 'Beam A1-B1 - Level 01', [[0.2, 7.0], [-0.15, 0.15], [3.3, 3.9]])
    check('ARC', 'Roof Covering', [[0, 36.0], [0, 21.6], [12.6, 12.72]])
    // Hung outside the slab edge, which is where a curtain wall goes and why it
    // does not clash with the floor it passes.
    check('ARC', 'Glazed Panel North 01 - Ground', [[-0.15, 3.15], [21.6, 21.75], [0.0, 4.2]])
  })

  it('federates: the three disciplines occupy one building, not three', () => {
    const footprint = (disc: string) => {
      const lo = [Infinity, Infinity]
      const hi = [-Infinity, -Infinity]
      for (const element of solids(disc)) {
        const box = extents(disc, element.expressID)
        for (const a of [0, 1]) {
          lo[a] = Math.min(lo[a], box[a][0])
          hi[a] = Math.max(hi[a], box[a][1])
        }
      }
      return { lo, hi }
    }
    const str_ = footprint('STR')
    const arc = footprint('ARC')
    const mep = footprint('MEP')
    // Every discipline sits inside the same 40 x 26 m envelope. Three models
    // that each validate but land in different places is THE federation
    // failure, and nothing inside a single file can see it.
    for (const f of [str_, arc, mep]) {
      expect(f.lo[0]).toBeGreaterThan(-2.1)
      expect(f.lo[1]).toBeGreaterThan(-2.1)
      expect(f.hi[0]).toBeLessThan(38.1)
      expect(f.hi[1]).toBeLessThan(23.7)
    }
  })

  it('has nothing clashing inside any one discipline', () => {
    for (const disc of Object.keys(FILES)) {
      const boxes = CLASH_CLASSES.flatMap((c) =>
        of(disc, c).map((e) => ({ name: `${c} "${str(e.Name)}"`, box: extents(disc, e.expressID) })))
      const clashes: string[] = []
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const overlaps = boxes[i].box.every(([lo, hi], a) => {
            const [otherLo, otherHi] = boxes[j].box[a]
            return lo + CLASH_PENETRATION < otherHi && hi - CLASH_PENETRATION > otherLo
          })
          if (overlaps) clashes.push(`${disc}: ${boxes[i].name} × ${boxes[j].name}`)
        }
      }
      expect(clashes.slice(0, 8), `${disc}: ${clashes.length} clashes`).toEqual([])
    }
  }, 120_000)
})

describe('the site scan agrees with the models', () => {
  const scanPath = path.join(DIR, SCAN)

  /** Minimal LAS 1.2 reader — header, the CRS VLR, and the points. */
  function readLas(): {
    epsg: number | null
    count: number
    points: Array<{ x: number; y: number; z: number; classification: number }>
  } {
    const buf = readFileSync(scanPath)
    expect(buf.subarray(0, 4).toString('ascii')).toBe('LASF')
    const headerSize = buf.readUInt16LE(94)
    const offsetToPoints = buf.readUInt32LE(96)
    const vlrCount = buf.readUInt32LE(100)
    const format = buf.readUInt8(104)
    const recordLength = buf.readUInt16LE(105)
    const count = buf.readUInt32LE(107)
    const scale = [buf.readDoubleLE(131), buf.readDoubleLE(139), buf.readDoubleLE(147)]
    const offset = [buf.readDoubleLE(155), buf.readDoubleLE(163), buf.readDoubleLE(171)]
    expect(format).toBe(2)
    expect(recordLength).toBe(26)

    let epsg: number | null = null
    let cursor = headerSize
    for (let i = 0; i < vlrCount; i++) {
      const userId = buf.subarray(cursor + 2, cursor + 18).toString('ascii').replace(/\0.*$/, '')
      const recordId = buf.readUInt16LE(cursor + 18)
      const length = buf.readUInt16LE(cursor + 20)
      if (userId === 'LASF_Projection' && recordId === 34735) {
        const payload = cursor + 54
        const keys = buf.readUInt16LE(payload + 6)
        for (let k = 0; k < keys; k++) {
          const base = payload + 8 + k * 8
          if (buf.readUInt16LE(base) === 3072) epsg = buf.readUInt16LE(base + 6)
        }
      }
      cursor += 54 + length
    }

    const points = []
    for (let i = 0; i < count; i++) {
      const at = offsetToPoints + i * recordLength
      points.push({
        x: buf.readInt32LE(at) * scale[0] + offset[0],
        y: buf.readInt32LE(at + 4) * scale[1] + offset[1],
        z: buf.readInt32LE(at + 8) * scale[2] + offset[2],
        classification: buf.readUInt8(at + 15),
      })
    }
    return { epsg, count, points }
  }

  let scan: ReturnType<typeof readLas>

  beforeAll(() => { scan = readLas() })

  it('declares the same projected CRS the models do', () => {
    // This single number is the difference between the top rung of the
    // alignment ladder and "placed by hand".
    expect(scan.epsg).toBe(Number(EPSG.split(':')[1]))
  })

  it('carries colour, intensity and real classification', () => {
    const classes = new Set(scan.points.map((p) => p.classification))
    // Ground, high vegetation, building — a scan whose every point is class 0
    // can render but cannot demonstrate classification, which is half the trap
    // documented in point-clouds.ts.
    expect([...classes].sort()).toEqual([2, 5, 6])
    expect(scan.count).toBe(150_000)
  })

  it('lands the scan on the model, without anybody dragging it', () => {
    // Project metres → EPSG:25831, exactly as IfcMapConversion defines it.
    const t = (ROTATION_DEG * Math.PI) / 180
    const toGrid = (x: number, y: number, z: number) => ({
      e: EASTINGS + x * Math.cos(t) - y * Math.sin(t),
      n: NORTHINGS + x * Math.sin(t) + y * Math.cos(t),
      h: HEIGHT + z,
    })

    // The building footprint's four corners, in grid coordinates.
    const corners = [[0, 0], [36, 0], [36, 21.6], [0, 21.6]].map(([x, y]) => toGrid(x, y, 0))
    const minE = Math.min(...corners.map((c) => c.e))
    const maxE = Math.max(...corners.map((c) => c.e))
    const minN = Math.min(...corners.map((c) => c.n))
    const maxN = Math.max(...corners.map((c) => c.n))

    const inside = scan.points.filter((p) => p.x > minE && p.x < maxE && p.y > minN && p.y < maxN)
    expect(inside.length, 'nothing scanned over the building').toBeGreaterThan(10_000)

    // The scanned slab soffits must sit at the modelled slab soffits. This is
    // the assertion the whole pair exists for: if the model moves and the scan
    // does not, or either changes CRS, these planes drift apart and nothing
    // else in the suite notices.
    const soffits = [4.2, 8.4, 12.6].map((z) => HEIGHT + z - 0.3)
    const concrete = inside.filter((p) => p.classification === 6)
    const onASoffit = concrete.filter((p) => soffits.some((s) => Math.abs(p.z - s) < 0.02))
    expect(onASoffit.length, 'no scan points on any modelled slab soffit').toBeGreaterThan(5_000)
  })

  it('surveys well beyond the plot, so the model has a context to sit in', () => {
    // Reduce, not Math.max(...points): spreading 150 000 arguments overflows
    // the call stack, which is a fun way to lose an afternoon.
    const span = (pick: (p: { x: number; y: number }) => number): number => {
      let lo = Infinity
      let hi = -Infinity
      for (const p of scan.points) {
        const v = pick(p)
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      return hi - lo
    }
    const spanE = span((p) => p.x)
    const spanN = span((p) => p.y)
    expect(spanE).toBeGreaterThan(80)
    expect(spanN).toBeGreaterThan(80)
  })
})
