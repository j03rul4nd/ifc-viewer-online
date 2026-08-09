// ─── the temple reference IFC, asserted ───────────────────────────────────────
// IFC Hello World proves the viewer reads four elements correctly. This proves
// it on the things a four-element file cannot contain: three storeys at
// different elevations, a column grid, openings that void their host and are
// filled, an element that decomposes into parts, a space that is aggregated
// rather than contained, and a roof swept along a ridge.
//
// The claim the gallery card makes is "realistic AND perfect". Perfect is not a
// vibe — it is the app's own rules returning nothing. The checks below are the
// ones that would silently stop being true: the clash sweep (which is why the
// walls sit between the columns rather than through them), the material and
// quantity coverage, and the storey ordering.
//
// Read through web-ifc, the parser the app ships, for the same reason as the
// Hello World fixture: a test that agreed with the file but not with the viewer
// would be worth nothing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { DEMO_MODELS } from '../../src/demo-models/models'

const IFC_PATH = path.join(process.cwd(), 'public', 'JapaneseTemple.ifc')
const DEMO = DEMO_MODELS.find((m) => m.id === 'japanese-temple')!

/** What the build script says it makes. Counts, not names — there are 92. */
const POPULATION: Record<string, number> = {
  IfcSlab: 6,
  IfcColumn: 22,
  IfcWall: 18,
  IfcBeam: 6,
  IfcMember: 18,
  IfcRailing: 5,
  IfcDoor: 3,
  IfcWindow: 4,
  IfcRoof: 1,
  IfcStair: 1,
  IfcStairFlight: 1,
  IfcOpeningElement: 7,
  IfcSpace: 1,
  IfcBuildingStorey: 3,
}

/** Storey name → elevation, in the order they stack. */
const STOREYS: Array<[string, number]> = [
  ['Stone Podium', 0.0],
  ['Main Hall', 0.9],
  ['Roof Structure', 4.32],
]

/**
 * Classes the app's clash rule sweeps (CLASH_ELEMENT_TYPES in
 * validator.worker.ts) and the penetration it needs before it complains.
 */
const CLASH_CLASSES = ['IFCWALL', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCROOF', 'IFCMEMBER', 'IFCPLATE']
const CLASH_PENETRATION = 0.05

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any

let api: IfcAPI
let model: number
let index = new Map<string, Line[]>()

const line = (id: number): Line => api.GetLine(model, id, false)
const deep = (id: number): Line => api.GetLine(model, id, true)
const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''
const of = (ifcClass: string): Line[] => index.get(ifcClass.toUpperCase()) ?? []
const named = (name: string): Line | undefined =>
  [...index.values()].flat().find((l) => str(l.Name) === name)

/** Express id → IFC class. web-ifc's lines do not carry their own class name. */
const classOf = new Map<number, string>()

/** Every physical element the model contains — openings and spaces excluded. */
function products(): Line[] {
  return Object.keys(POPULATION)
    .filter((c) => !['IfcOpeningElement', 'IfcSpace', 'IfcBuildingStorey'].includes(c))
    .flatMap((c) => of(c))
}

/**
 * Elements that have a body of their own. The stair is the exception and is
 * meant to be: an aggregate's geometry lives in its parts, so IfcStair has no
 * representation and GetFlatMesh rightly returns nothing for it.
 */
function solids(): Line[] {
  return products().filter((e) => classOf.get(e.expressID) !== 'IFCSTAIR')
}

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  model = api.OpenModel(new Uint8Array(readFileSync(IFC_PATH)))
  index = new Map()
  for (const type of api.GetIfcEntityList(model)) {
    const name = api.GetNameFromTypeCode(type).toUpperCase()
    const ids = api.GetLineIDsWithType(model, type)
    const lines: Line[] = []
    for (let i = 0; i < ids.size(); i++) {
      const entity = line(ids.get(i))
      classOf.set(entity.expressID, name)
      lines.push(entity)
    }
    index.set(name, (index.get(name) ?? []).concat(lines))
  }
}, 60_000)

afterAll(() => {
  api?.CloseModel?.(model)
  api?.Dispose?.()
})

describe('Japanese Temple — the file the gallery ships', () => {
  it('is the IFC4 file the gallery card promises', () => {
    expect(api.GetModelSchema(model)).toBe('IFC4')
    expect(statSync(IFC_PATH).size).toBe(DEMO.sizeBytes)
    expect(DEMO.fileName).toBe(path.basename(IFC_PATH))
    expect(DEMO.ifcUrl.endsWith(DEMO.fileName)).toBe(true)
    expect(DEMO.schema).toBe('IFC4')
  })

  it('has exactly the population the build script writes', () => {
    for (const [ifcClass, count] of Object.entries(POPULATION)) {
      expect(of(ifcClass).length, ifcClass).toBe(count)
    }
    // An IfcBuildingElementProxy is what an exporter emits when it gave up.
    // There is no reason for one here, so its presence would mean something
    // went wrong that nothing else would notice.
    expect(of('IfcBuildingElementProxy')).toHaveLength(0)
  })
})

describe('spatial structure', () => {
  function aggregates(): Map<number, number[]> {
    const out = new Map<number, number[]>()
    for (const rel of of('IfcRelAggregates')) {
      const parent = rel.RelatingObject.value
      out.set(parent, (out.get(parent) ?? []).concat(rel.RelatedObjects.map((o: Line) => o.value)))
    }
    return out
  }

  it('chains Project → Site → Building → three storeys', () => {
    const links = aggregates()
    const project = of('IfcProject')[0]
    const site = of('IfcSite')[0]
    const building = of('IfcBuilding')[0]
    expect(links.get(project.expressID)).toEqual([site.expressID])
    expect(links.get(site.expressID)).toEqual([building.expressID])
    expect(links.get(building.expressID)!.length).toBe(3)
  })

  it('stacks the storeys in ascending order, with no two at the same level', () => {
    const found = of('IfcBuildingStorey')
      .map((s) => [str(s.Name), s.Elevation.value] as [string, number])
      .sort((a, b) => a[1] - b[1])
    expect(found).toEqual(STOREYS)
    expect(new Set(found.map(([, e]) => e)).size).toBe(STOREYS.length)
  })

  it('contains every element in a storey, and puts each where it belongs', () => {
    const container = new Map<number, string>()
    for (const rel of of('IfcRelContainedInSpatialStructure')) {
      const storey = str(line(rel.RelatingStructure.value).Name)
      for (const e of rel.RelatedElements) container.set(e.value, storey)
    }
    for (const element of products()) {
      // The stair flight is a part of the stair, not a thing in the storey.
      if (classOf.get(element.expressID) === 'IFCSTAIRFLIGHT') continue
      expect(container.get(element.expressID), str(element.Name)).toBeTruthy()
    }
    expect(container.get(named('Kidan Stone Podium')!.expressID)).toBe('Stone Podium')
    expect(container.get(named('Hall Floor')!.expressID)).toBe('Main Hall')
    expect(container.get(named('Hashira Column A1')!.expressID)).toBe('Main Hall')
    expect(container.get(named('Kirizuma Roof')!.expressID)).toBe('Roof Structure')
    expect(container.get(named('Tokyo Bracket Set A1')!.expressID)).toBe('Roof Structure')
  })

  it('decomposes the stair into its flight, rather than orphaning the flight', () => {
    const stair = named('Kizahashi Steps')!
    const flight = named('Kizahashi Stair Flight')!
    const rel = of('IfcRelAggregates').find((r) => r.RelatingObject.value === stair.expressID)
    expect(rel, 'stair has no parts').toBeTruthy()
    expect(rel.RelatedObjects.map((o: Line) => o.value)).toEqual([flight.expressID])

    // And it is NOT also contained in the storey: an element cannot be both a
    // part of something and a sibling of it.
    const contained = of('IfcRelContainedInSpatialStructure')
      .flatMap((r: Line) => r.RelatedElements.map((e: Line) => e.value))
    expect(contained).not.toContain(flight.expressID)
  })

  it('aggregates the space into the storey — a room is not an element in it', () => {
    const space = of('IfcSpace')[0]
    const storeyIds = new Set(of('IfcBuildingStorey').map((s) => s.expressID))
    const rel = of('IfcRelAggregates').find(
      (r) => storeyIds.has(r.RelatingObject.value) &&
        r.RelatedObjects.some((o: Line) => o.value === space.expressID),
    )
    expect(rel, 'space is not decomposed from a storey').toBeTruthy()
    expect(str(space.LongName)).not.toBe('')
  })
})

describe('openings, doors and windows', () => {
  it('voids a wall for every opening and fills every opening', () => {
    const voids = of('IfcRelVoidsElement')
    const fills = of('IfcRelFillsElement')
    expect(voids).toHaveLength(POPULATION.IfcOpeningElement)
    expect(fills).toHaveLength(POPULATION.IfcDoor + POPULATION.IfcWindow)

    const wallIds = new Set(of('IfcWall').map((w) => w.expressID))
    for (const rel of voids) {
      expect(wallIds.has(rel.RelatingBuildingElement.value), 'opening voids a non-wall').toBe(true)
    }
    const filled = new Set(fills.map((r) => r.RelatingOpeningElement.value))
    for (const opening of of('IfcOpeningElement')) {
      expect(filled.has(opening.expressID), `${str(opening.Name)} is an unfilled hole`).toBe(true)
    }
  })

  it('gives every door and window its overall size, not just a box', () => {
    for (const element of [...of('IfcDoor'), ...of('IfcWindow')]) {
      expect(element.OverallWidth?.value, str(element.Name)).toBeGreaterThan(0)
      expect(element.OverallHeight?.value, str(element.Name)).toBeGreaterThan(0)
    }
  })
})

describe('data every element carries', () => {
  function relatedTo(relClass: string, attribute: string): Set<number> {
    const out = new Set<number>()
    for (const rel of of(relClass)) {
      for (const o of rel[attribute] ?? []) out.add(o.value)
    }
    return out
  }

  it('names and describes every element', () => {
    for (const element of products()) {
      expect(str(element.Name)).not.toBe('')
      expect(str(element.Description), str(element.Name)).not.toBe('')
    }
    expect(new Set(products().map((e) => str(e.Name))).size).toBe(products().length)
  })

  it('gives every rooted entity a well-formed, unique GlobalId', () => {
    const guids = [...index.values()].flat().filter((l) => l.GlobalId).map((l) => str(l.GlobalId))
    for (const guid of guids) expect(guid, guid).toMatch(/^[0-9A-Za-z_$]{22}$/)
    expect(new Set(guids).size).toBe(guids.length)
  })

  it('types every element, so shared data is carried once', () => {
    const typed = relatedTo('IfcRelDefinesByType', 'RelatedObjects')
    for (const element of products()) {
      expect(typed.has(element.expressID), `${str(element.Name)} has no type`).toBe(true)
    }
  })

  it('tells every element what it is made of, on the element itself', () => {
    // Not on the type: the app's material rule reads IfcRelAssociatesMaterial
    // on the occurrence, and so does every take-off tool. Layer sets and profile
    // sets both produce a *Usage on the occurrence — a bare IfcMaterial on the
    // type does not, which is the whole reason columns and beams carry profile
    // sets here.
    const withMaterial = relatedTo('IfcRelAssociatesMaterial', 'RelatedObjects')
    for (const element of products()) {
      expect(withMaterial.has(element.expressID), `${str(element.Name)} has no material`).toBe(true)
    }
    expect(of('IfcMaterialLayerSetUsage').length).toBeGreaterThan(0)
    expect(of('IfcMaterialProfileSetUsage').length).toBe(
      POPULATION.IfcColumn + POPULATION.IfcBeam + POPULATION.IfcMember,
    )
  })

  it('classifies every element', () => {
    const classified = relatedTo('IfcRelAssociatesClassification', 'RelatedObjects')
    for (const element of products()) {
      expect(classified.has(element.expressID), `${str(element.Name)} is unclassified`).toBe(true)
    }
    // Deliberately our own scheme, not Uniclass — see build-temple.py. If this
    // ever says Uniclass, the codes had better be real ones.
    expect(str(of('IfcClassification')[0].Name)).toBe('Reference Element Classification')
  })

  it('gives every element a property set and base quantities', () => {
    const byProps = new Map<number, string[]>()
    for (const rel of of('IfcRelDefinesByProperties')) {
      const definition = deep(rel.RelatingPropertyDefinition.value)
      for (const o of rel.RelatedObjects) {
        byProps.set(o.value, (byProps.get(o.value) ?? []).concat(str(definition.Name)))
      }
    }
    for (const element of products()) {
      const sets = byProps.get(element.expressID) ?? []
      expect(sets.some((n) => n.startsWith('Pset_')), `${str(element.Name)}: no Pset`).toBe(true)
      expect(sets.some((n) => n.startsWith('Qto_')), `${str(element.Name)}: no Qto`).toBe(true)
    }
    const space = byProps.get(of('IfcSpace')[0].expressID) ?? []
    expect(space).toContain('Qto_SpaceBaseQuantities')
  })

  it('carries no empty property or quantity values', () => {
    for (const prop of of('IfcPropertySingleValue')) {
      expect(str(prop.Name)).not.toBe('')
      expect(prop.NominalValue?.value, str(prop.Name)).not.toBe('')
      expect(prop.NominalValue?.value, str(prop.Name)).not.toBeUndefined()
    }
  })

  it('gives the space a floor area, which is the one number a room is for', () => {
    const qto = of('IfcElementQuantity').find((q) => str(q.Name) === 'Qto_SpaceBaseQuantities')!
    const area = qto.Quantities
      .map((q: Line) => deep(q.value))
      .find((q: Line) => str(q.Name) === 'NetFloorArea')
    expect(area, 'space has no NetFloorArea').toBeTruthy()
    // 11.84 x 9.44 — the hall inside the wall centrelines.
    expect(area.AreaValue.value).toBeCloseTo(111.7696, 3)
  })
})

describe('units, context and georeferencing', () => {
  it('measures in metres, square metres and cubic metres', () => {
    const units = deep(of('IfcProject')[0].UnitsInContext.value).Units as Line[]
    const si = units.map((u) => `${str(u.UnitType)}:${str(u.Prefix)}${str(u.Name)}`)
    expect(si.sort()).toEqual(['AREAUNIT:SQUARE_METRE', 'LENGTHUNIT:METRE', 'VOLUMEUNIT:CUBIC_METRE'])
  })

  it('says where on earth it is', () => {
    // Level 20/40 georeferencing: IfcSite latitude and longitude, which is what
    // the overwhelming majority of real files carry.
    const site = of('IfcSite')[0]
    // IfcCompoundPlaneAngleMeasure is a list of integers; web-ifc hands it back
    // either as the list or wrapped in a value object depending on the build.
    const angle = (v: Line): number[] =>
      (Array.isArray(v) ? v : v.value).map((n: Line) => (typeof n === 'number' ? n : n.value))
    expect(angle(site.RefLatitude)).toEqual([34, 59, 41, 640000])
    expect(angle(site.RefLongitude)).toEqual([135, 47, 6, 0])
    expect(site.RefElevation.value).toBe(45)
  })

  it('sweeps every body — no element is a bag of triangles', () => {
    const bodies = of('IfcShapeRepresentation').filter(
      (r) => str(r.RepresentationIdentifier) === 'Body',
    )
    expect(bodies.length).toBe(products().length + POPULATION.IfcOpeningElement + POPULATION.IfcSpace - 1)
    for (const body of bodies) {
      expect(str(body.RepresentationType), str(body.RepresentationIdentifier)).toBe('SweptSolid')
    }
  })
})

describe('the geometry the viewer actually gets', () => {
  /** World-space AABB in IFC axes, built the way the clash rule builds it. */
  function extents(expressID: number): [[number, number], [number, number], [number, number]] {
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
        ifc.forEach((v, a) => {
          lo[a] = Math.min(lo[a], v)
          hi[a] = Math.max(hi[a], v)
        })
      }
      geom.delete()
    }
    expect(lo[0], 'no triangles at all').not.toBe(Infinity)
    return [[lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]]]
  }

  it('gives every element geometry the parser can resolve', () => {
    for (const element of solids()) {
      const [x, y, z] = extents(element.expressID)
      for (const [lo, hi] of [x, y, z]) {
        expect(hi - lo, `${str(element.Name)} is flat`).toBeGreaterThan(0.001)
      }
    }
  })

  it('builds the hall the plan says it does', () => {
    // Podium 16.0 x 13.6, hall floor on the 12.0 x 9.6 grid, roof out to the
    // eaves 2.8 m beyond it, ridge 10.0 m up.
    const check = (name: string, want: number[][], tolerance = 0.002) => {
      extents(named(name)!.expressID).forEach(([lo, hi], a) => {
        expect(Math.abs(lo - want[a][0]), `${name} min ${'xyz'[a]} = ${lo}`).toBeLessThan(tolerance)
        expect(Math.abs(hi - want[a][1]), `${name} max ${'xyz'[a]} = ${hi}`).toBeLessThan(tolerance)
      })
    }
    check('Kidan Stone Podium', [[-2.0, 14.0], [-2.0, 11.6], [0.0, 0.9]])
    check('Hall Floor', [[0.0, 12.0], [0.0, 9.6], [0.9, 1.02]])
    check('Kirizuma Roof', [[-2.8, 14.8], [-2.8, 12.4], [5.1, 10.0]])
    // A quarter turn the parser drops would leave this wall running along X.
    check('West Wall Panel 1', [[-0.08, 0.08], [0.18, 2.22], [1.02, 4.32]])
    // Swept along its own axis, not extruded upwards: 12 m long, 300 mm deep.
    check('Kashiranuki Head Tie (South)', [[0.0, 12.0], [-0.12, 0.12], [4.32, 4.62]])
    // A round pillar arrives tessellated, so its box sits inside the true
    // Ø360 by the sagitta of one segment — a couple of centimetres, not a
    // placement error. Height is exact because that axis is not curved.
    check('Hashira Column A1', [[-0.18, 0.18], [-0.18, 0.18], [1.02, 4.32]], 0.01)
  })

  it('stands the walls on the deck and the roof on the brackets', () => {
    const deckTop = extents(named('Hall Floor')!.expressID)[2][1]
    for (const wall of of('IfcWall')) {
      expect(extents(wall.expressID)[2][0], str(wall.Name)).toBeCloseTo(deckTop, 3)
    }
    const bracketTop = extents(named('Tokyo Bracket Set A1')!.expressID)[2][1]
    expect(extents(named('Kirizuma Roof')!.expressID)[2][0]).toBeCloseTo(bracketTop, 3)
  })

  it('has nothing clashing with anything — the whole point of the model', () => {
    // The app's own sweep, run here so a change to the geometry cannot quietly
    // turn the reference model into a model with 46 warnings. Walls sit BETWEEN
    // columns, head ties butt at the corners, and every level touches the one
    // below at exactly one plane; all three are what keep this at zero.
    const boxes = CLASH_CLASSES.flatMap((c) =>
      of(c).map((e) => ({ name: `${c} "${str(e.Name)}"`, box: extents(e.expressID) })),
    )
    expect(boxes.length).toBeGreaterThan(60)

    const clashes: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlaps = boxes[i].box.every(([lo, hi], a) => {
          const [otherLo, otherHi] = boxes[j].box[a]
          return lo + CLASH_PENETRATION < otherHi && hi - CLASH_PENETRATION > otherLo
        })
        if (overlaps) clashes.push(`${boxes[i].name} × ${boxes[j].name}`)
      }
    }
    expect(clashes, `${clashes.length} clashes`).toEqual([])
  })

  it('stays near the origin, so no viewer has to fight float precision', () => {
    for (const element of solids()) {
      for (const [lo, hi] of extents(element.expressID)) {
        expect(Math.max(Math.abs(lo), Math.abs(hi))).toBeLessThan(50)
      }
    }
  })
})
