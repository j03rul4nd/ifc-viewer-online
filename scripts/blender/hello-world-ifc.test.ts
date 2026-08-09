// ─── the reference IFC, asserted ──────────────────────────────────────────────
// IFC Hello World is the one model in the gallery whose contents we control, so
// it is the only one we can assert exactly. That is its whole job: when a
// parser change breaks storey containment or drops a placement, every other
// demo degrades quietly — a wall lands in the wrong place in a file with nine
// hundred of them and nobody notices for a release. Here there are four
// elements, and a test that names each one.
//
// It reads the file through web-ifc, the SAME parser the app ships, rather than
// re-parsing the SPF text. A test that agreed with the file but not with the
// viewer would be worth nothing.
//
// build-hello-world.py already fails the build on schema violations and on
// geometry that will not load back in Bonsai. What it cannot check is whether
// OUR pipeline sees the same model, and whether the gallery entry still
// describes the file on disk. That is what is below.
//
// Lives in scripts/ for the reason repo-complete.test.ts explains: it needs
// node:fs, and tsconfig.json's browser program has no @types/node.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { DEMO_MODELS } from '../../src/demo-models/models'

const IFC_PATH = path.join(process.cwd(), 'public', 'HelloWorld.ifc')
const DEMO = DEMO_MODELS.find((m) => m.id === 'hello-world')!

/** Names the build script wrote, in the order the room is described. */
const WALLS = ['Hello World Wall 01', 'Hello World Wall 02', 'Hello World Wall 03']
const SLAB = 'Hello World Slab'
const ELEMENTS = [...WALLS, SLAB].sort()

/** Element origin in world metres, straight out of build-hello-world.py. */
const ORIGINS: Record<string, [number, number, number]> = {
  'Hello World Wall 01': [-0.2, 3.0, 0.0],
  'Hello World Wall 02': [0.0, -0.2, 0.0],
  'Hello World Wall 03': [4.0, 3.0, 0.0],
  'Hello World Slab': [-0.2, -0.2, -0.2],
}

/**
 * Where each element's TRIANGLES end up, in world metres: [min, max] per axis.
 *
 * This is the assertion that a placement test cannot make. A placement says
 * where the origin is; this says where the material is, after the profile has
 * been extruded and the local frame rotated. Wall 02 and Wall 03 run along Y
 * because their placements turn a quarter circle, and if that rotation is ever
 * dropped they both collapse onto the X axis with their origins still perfect.
 */
const EXTENTS: Record<string, [[number, number], [number, number], [number, number]]> = {
  'Hello World Wall 01': [[-0.2, 4.2], [3.0, 3.2], [0.0, 2.7]],
  'Hello World Wall 02': [[-0.2, 0.0], [-0.2, 3.0], [0.0, 2.7]],
  'Hello World Wall 03': [[4.0, 4.2], [-0.2, 3.0], [0.0, 2.7]],
  'Hello World Slab': [[-0.2, 4.2], [-0.2, 3.2], [-0.2, 0.0]],
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any

let api: IfcAPI
let model: number
/** Class name (uppercase, as web-ifc reports it) → its lines. */
let index = new Map<string, Line[]>()

/** One entity, attributes unresolved: handles stay handles, so ids are visible. */
const line = (id: number): Line => api.GetLine(model, id, false)
/** One entity, attributes resolved all the way down. */
const deep = (id: number): Line => api.GetLine(model, id, true)

const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''

const of = (ifcClass: string): Line[] => index.get(ifcClass.toUpperCase()) ?? []
const one = (ifcClass: string): Line => {
  const found = of(ifcClass)
  if (found.length !== 1) throw new Error(`expected exactly one ${ifcClass}, found ${found.length}`)
  return found[0]
}
/** The four physical elements, in a stable order. */
const products = (): Line[] =>
  [...of('IfcWall'), ...of('IfcSlab')].sort((a, b) => str(a.Name).localeCompare(str(b.Name)))

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  model = api.OpenModel(new Uint8Array(readFileSync(IFC_PATH)))

  index = new Map()
  for (const type of api.GetIfcEntityList(model)) {
    const name = api.GetNameFromTypeCode(type)
    const ids = api.GetLineIDsWithType(model, type)
    const lines: Line[] = []
    for (let i = 0; i < ids.size(); i++) lines.push(line(ids.get(i)))
    index.set(name.toUpperCase(), (index.get(name.toUpperCase()) ?? []).concat(lines))
  }
}, 30_000)

afterAll(() => {
  api?.CloseModel?.(model)
  api?.Dispose?.()
})

describe('IFC Hello World — the file the gallery ships', () => {
  it('is the IFC4 file the gallery card promises', () => {
    expect(api.GetModelSchema(model)).toBe('IFC4')
    // Checked in both directions, like the props assets: quoting a size the
    // file has outgrown is a broken promise, and so is quoting one it never
    // reached — the second is the one nobody notices.
    expect(statSync(IFC_PATH).size).toBe(DEMO.sizeBytes)
    expect(DEMO.fileName).toBe(path.basename(IFC_PATH))
    expect(DEMO.ifcUrl.endsWith(DEMO.fileName)).toBe(true)
    expect(DEMO.schema).toBe('IFC4')
  })

  it('holds four elements and not one more', () => {
    expect(of('IfcWall').map((w) => str(w.Name)).sort()).toEqual(WALLS)
    expect(of('IfcSlab').map((s) => str(s.Name))).toEqual([SLAB])
    expect(of('IfcProject')).toHaveLength(1)
    expect(of('IfcSite')).toHaveLength(1)
    expect(of('IfcBuilding')).toHaveLength(1)
    expect(of('IfcBuildingStorey')).toHaveLength(1)
    // Nothing snuck in. A reference model that grew an IfcBuildingElementProxy
    // is no longer the thing being referenced.
    expect(of('IfcOpeningElement')).toHaveLength(0)
    expect(of('IfcBuildingElementProxy')).toHaveLength(0)
  })
})

describe('spatial structure', () => {
  it('chains Project → Site → Building → Storey, one link each', () => {
    const links = new Map<number, number[]>()
    for (const rel of of('IfcRelAggregates')) {
      links.set(rel.RelatingObject.value, rel.RelatedObjects.map((o: Line) => o.value))
    }
    expect(links.get(one('IfcProject').expressID)).toEqual([one('IfcSite').expressID])
    expect(links.get(one('IfcSite').expressID)).toEqual([one('IfcBuilding').expressID])
    expect(links.get(one('IfcBuilding').expressID)).toEqual([one('IfcBuildingStorey').expressID])
    expect(links.size).toBe(3)
  })

  it('puts every physical element in the storey — none in the site or building', () => {
    const rels = of('IfcRelContainedInSpatialStructure')
    expect(rels).toHaveLength(1)
    expect(rels[0].RelatingStructure.value).toBe(one('IfcBuildingStorey').expressID)
    expect(rels[0].RelatedElements.map((e: Line) => str(line(e.value).Name)).sort()).toEqual(ELEMENTS)
  })

  it('gives the storey an elevation to sort on', () => {
    expect(one('IfcBuildingStorey').Elevation.value).toBe(0)
  })
})

describe('identity and metadata', () => {
  const GUID = /^[0-9A-Za-z_$]{22}$/

  it('gives every rooted entity a well-formed, unique GlobalId', () => {
    const guids = [...index.values()].flat().filter((l) => l.GlobalId).map((l) => str(l.GlobalId))
    expect(guids.length).toBeGreaterThan(20)
    for (const guid of guids) expect(guid, guid).toMatch(GUID)
    expect(new Set(guids).size).toBe(guids.length)
  })

  it('names the project the way ISO 19650 asks, which is what our validator checks', () => {
    const project = one('IfcProject')
    expect(str(project.Name)).toBe('IFC Hello World')
    expect(str(project.LongName)).not.toBe('')
    expect(str(project.Description)).not.toBe('')
    expect(str(project.ObjectType)).not.toBe('')
  })

  it('names and describes every element', () => {
    for (const element of products()) {
      expect(str(element.Name)).not.toBe('')
      expect(str(element.Description)).not.toBe('')
    }
  })

  it('declares PredefinedType once, on the type, and lets occurrences inherit it', () => {
    expect(str(one('IfcWallType').PredefinedType)).toBe('SOLIDWALL')
    expect(str(one('IfcSlabType').PredefinedType)).toBe('FLOOR')

    // Occurrences carry NEITHER PredefinedType nor ObjectType, and that is
    // deliberate rather than an omission: IfcOpenShell strips both when a type
    // is assigned, so the two can never contradict each other (IfcOpenShell
    // #7006). It also means a consumer that wants an element's predefined type
    // has to resolve IfcRelDefinesByType — which is exactly the behaviour a
    // reference model should be exercising.
    for (const element of products()) {
      expect(element.PredefinedType, str(element.Name)).toBeNull()
      expect(element.ObjectType, str(element.Name)).toBeNull()
    }

    const typeOf = new Map<number, string>()
    for (const rel of of('IfcRelDefinesByType')) {
      const predefined = str(line(rel.RelatingType.value).PredefinedType)
      for (const o of rel.RelatedObjects) typeOf.set(o.value, predefined)
    }
    for (const wall of of('IfcWall')) expect(typeOf.get(wall.expressID)).toBe('SOLIDWALL')
    expect(typeOf.get(one('IfcSlab').expressID)).toBe('FLOOR')
  })
})

describe('units and geometric context', () => {
  it('measures in metres, square metres and cubic metres', () => {
    const units = deep(one('IfcProject').UnitsInContext.value).Units as Line[]
    const si = units.map((u) => `${str(u.UnitType)}:${str(u.Prefix)}${str(u.Name)}`)
    expect(si.sort()).toEqual(['AREAUNIT:SQUARE_METRE', 'LENGTHUNIT:METRE', 'VOLUMEUNIT:CUBIC_METRE'])
  })

  it('carries a 3D Model context whose world coordinate system is the origin', () => {
    const modelCtx = of('IfcGeometricRepresentationContext').find((c) => str(c.ContextType) === 'Model')
    expect(modelCtx).toBeTruthy()
    expect(modelCtx.CoordinateSpaceDimension.value).toBe(3)
    expect(modelCtx.Precision.value).toBeLessThanOrEqual(1e-5)

    const origin = line(line(modelCtx.WorldCoordinateSystem.value).Location.value)
    expect(origin.Coordinates.map((c: Line) => c.value)).toEqual([0, 0, 0])
  })

  it('puts the bodies in the Body subcontext, where a viewer looks for them', () => {
    const bodies = of('IfcShapeRepresentation').filter(
      (r) => str(r.RepresentationIdentifier) === 'Body',
    )
    expect(bodies).toHaveLength(4)
    for (const body of bodies) {
      expect(str(body.RepresentationType)).toBe('SweptSolid')
      expect(str(line(body.ContextOfItems.value).ContextIdentifier)).toBe('Body')
    }
  })
})

describe('placement and geometry', () => {
  /** Absolute origin of an element, walking the IfcLocalPlacement chain up. */
  function worldOrigin(element: Line): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0]
    let placement: Line | null = line(element.ObjectPlacement.value)
    while (placement) {
      const point = line(line(placement.RelativePlacement.value).Location.value)
      // Every placement here is either axis-aligned or a quarter turn about Z,
      // and no ancestor is rotated, so summing translations is exact. A model
      // with a rotated storey would need the full matrix — which is itself
      // something worth knowing about the reference model.
      point.Coordinates.forEach((c: Line, i: number) => { out[i] += c.value })
      placement = placement.PlacementRelTo ? line(placement.PlacementRelTo.value) : null
    }
    return out
  }

  it('places every element where the build script put it', () => {
    for (const element of products()) {
      const name = str(element.Name)
      worldOrigin(element).forEach((v, i) => expect(v, `${name} axis ${i}`).toBeCloseTo(ORIGINS[name][i], 9))
    }
  })

  it('hangs every element off the storey placement, not off nothing', () => {
    const storeyPlacement = one('IfcBuildingStorey').ObjectPlacement.value
    for (const element of products()) {
      const placement = line(element.ObjectPlacement.value)
      expect(placement.PlacementRelTo?.value, str(element.Name)).toBe(storeyPlacement)
    }
  })

  it('stays near the origin, so no viewer has to fight float precision', () => {
    for (const element of products()) {
      for (const v of worldOrigin(element)) expect(Math.abs(v)).toBeLessThan(10)
    }
  })

  it('extrudes real solids — three 2.7 m walls on a 0.2 m slab', () => {
    const solids = of('IfcExtrudedAreaSolid')
    expect(solids).toHaveLength(4)
    expect(solids.map((s) => s.Depth.value).sort((a: number, b: number) => a - b))
      .toEqual([0.2, 2.7, 2.7, 2.7])
    for (const solid of solids) {
      expect(str(line(solid.SweptArea.value).ProfileType)).toBe('AREA')
      const dir = line(solid.ExtrudedDirection.value)
      expect(dir.DirectionRatios.map((r: Line) => r.value)).toEqual([0, 0, 1])
    }
  })

  it('gives every wall an Axis, which is what plans and wall joins read', () => {
    const axes = of('IfcShapeRepresentation').filter(
      (r) => str(r.RepresentationIdentifier) === 'Axis',
    )
    expect(axes).toHaveLength(WALLS.length)
  })
})

describe('the geometry the viewer actually gets', () => {
  /**
   * World-space bounding box of an element's triangles, built exactly the way
   * the validator's clash rule builds it (see computeAABB in validator.worker).
   * That is the point: this asserts what OUR pipeline resolves, not what the
   * SPF says. A placement the parser ignores, a profile it misreads and a
   * rotation it drops all show up here and nowhere else.
   */
  function extents(expressID: number): [[number, number], [number, number], [number, number]] {
    const mesh = api.GetFlatMesh(model, expressID)
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (let g = 0; g < mesh.geometries.size(); g++) {
      const placed = mesh.geometries.get(g)
      const m = placed.flatTransformation // column-major 4x4
      const geom = api.GetGeometry(model, placed.geometryExpressID)
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
      // Six floats per vertex: position then normal.
      for (let i = 0; i < verts.length; i += 6) {
        const [x, y, z] = [verts[i], verts[i + 1], verts[i + 2]]
        const w = [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ]
        // web-ifc hands geometry to the renderer Y-up, because three.js is
        // Y-up and IFC is Z-up: (x, y, z)_ifc arrives as (x, z, -y). Convert
        // back, so the numbers asserted below are the metres in the model
        // rather than the metres in the scene graph.
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

  it('puts every element exactly where the room says it should be', () => {
    const axes = ['x', 'y', 'z']
    for (const element of products()) {
      const name = str(element.Name)
      extents(element.expressID).forEach(([lo, hi], a) => {
        const [wantLo, wantHi] = EXTENTS[name][a]
        expect(lo, `${name} min ${axes[a]}`).toBeCloseTo(wantLo, 4)
        expect(hi, `${name} max ${axes[a]}`).toBeCloseTo(wantHi, 4)
      })
    }
  })

  it('builds a room 4.4 x 3.4 x 2.9 and nothing else', () => {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const element of products()) {
      extents(element.expressID).forEach(([a, b], i) => {
        lo[i] = Math.min(lo[i], a)
        hi[i] = Math.max(hi[i], b)
      })
    }
    expect(hi.map((v, i) => Number((v - lo[i]).toFixed(4)))).toEqual([4.4, 3.4, 2.9])
  })

  it('leaves the walls standing on the slab, not sunk into it', () => {
    // Wall bases and the slab's top face are the same plane. Off by a
    // millimetre and the clash rule starts reporting the reference model.
    const slabTop = extents(one('IfcSlab').expressID)[2][1]
    for (const wall of of('IfcWall')) {
      expect(extents(wall.expressID)[2][0]).toBeCloseTo(slabTop, 4)
    }
  })

  it('keeps the three walls out of each other', () => {
    const boxes = of('IfcWall').map((w) => ({ name: str(w.Name), box: extents(w.expressID) }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        // Overlapping on all three axes is a clash; sharing a face is not.
        const overlaps = boxes[i].box.every(([lo, hi], a) => {
          const [otherLo, otherHi] = boxes[j].box[a]
          return lo + 1e-6 < otherHi && hi - 1e-6 > otherLo
        })
        expect(overlaps, `${boxes[i].name} vs ${boxes[j].name}`).toBe(false)
      }
    }
  })
})

describe('properties, types and materials', () => {
  /** Pset name → property name → value, for one element. */
  function psetsOf(element: Line): Map<string, Map<string, unknown>> {
    const out = new Map<string, Map<string, unknown>>()
    for (const rel of of('IfcRelDefinesByProperties')) {
      if (!rel.RelatedObjects.some((o: Line) => o.value === element.expressID)) continue
      const pset = deep(rel.RelatingPropertyDefinition.value)
      const props = new Map<string, unknown>()
      for (const p of pset.HasProperties ?? []) props.set(str(p.Name), p.NominalValue?.value)
      out.set(str(pset.Name), props)
    }
    return out
  }

  it('gives each class the property set that belongs to it', () => {
    for (const wall of of('IfcWall')) {
      const psets = psetsOf(wall)
      expect([...psets.keys()]).toEqual(['Pset_WallCommon'])
      expect(psets.get('Pset_WallCommon')!.get('IsExternal')).toBe(true)
      expect(psets.get('Pset_WallCommon')!.get('LoadBearing')).toBe(true)
    }
    const slab = psetsOf(one('IfcSlab'))
    expect([...slab.keys()]).toEqual(['Pset_SlabCommon'])
    expect(slab.get('Pset_SlabCommon')!.get('IsExternal')).toBe(true)
  })

  it('carries no empty property values, which is what the quality rule looks for', () => {
    for (const prop of of('IfcPropertySingleValue')) {
      expect(str(prop.Name)).not.toBe('')
      expect(prop.NominalValue?.value).not.toBe('')
      expect(prop.NominalValue?.value).not.toBeUndefined()
    }
  })

  it('types every occurrence, so shared data is carried once', () => {
    const rels = of('IfcRelDefinesByType')
    expect(rels).toHaveLength(2)
    const typed = rels.flatMap((r: Line) => r.RelatedObjects.map((o: Line) => str(line(o.value).Name)))
    expect(typed.sort()).toEqual(ELEMENTS)
  })

  it('associates a material layer set with everything, thickness and all', () => {
    expect(of('IfcMaterialLayerSet')).toHaveLength(2)
    expect(of('IfcMaterialLayer').map((l) => l.LayerThickness.value)).toEqual([0.2, 0.2])

    // Layers stack across a wall's thickness (AXIS2) and through a slab's
    // depth (AXIS3). Getting this wrong is invisible in a viewer and wrong
    // everywhere else — take-off, thermal analysis, anything reading layers.
    expect(of('IfcMaterialLayerSetUsage').map((u) => str(u.LayerSetDirection)).sort())
      .toEqual(['AXIS2', 'AXIS2', 'AXIS2', 'AXIS3'])

    const associated = new Set(
      of('IfcRelAssociatesMaterial').flatMap((r: Line) =>
        r.RelatedObjects.map((o: Line) => str(line(o.value).Name)),
      ),
    )
    for (const name of ELEMENTS) expect(associated.has(name), name).toBe(true)
  })
})
