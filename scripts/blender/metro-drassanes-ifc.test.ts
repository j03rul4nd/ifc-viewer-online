// ─── the underground demo station, asserted ───────────────────────────────────
// Drassanes is the one gallery model that lives BELOW the street, and that is
// the whole reason it exists: it is what the subsurface view is QA'd against.
// So the claims worth testing are the vertical ones — everything under the
// street, nothing poking out but the stair heads — and the plan claim that it
// stands on the real OSM platforms, not an invented box.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { DEMO_MODELS } from '../../src/demo-models/models'

const DIR = path.join(process.cwd(), 'public', 'models', 'metro-drassanes')
const FILE = 'BCN-IVO-DRS-XX-M3-A-0001.ifc'

/** The OSM platform ring of Via 1, metres east/north of the station node (drassanes_site.py). */
const VIA_1 = [[18.17, 23.02], [21.2, 21.13], [-28.58, -58.67], [-31.49, -56.81]]

/* eslint-disable @typescript-eslint/no-explicit-any */
type Line = any
let api: IfcAPI
let model: number
const byClass = new Map<string, Line[]>()

const str = (v: { value?: unknown } | null | undefined): string =>
  v && typeof v.value === 'string' ? v.value : ''

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  model = api.OpenModel(new Uint8Array(readFileSync(path.join(DIR, FILE))))
  for (const type of api.GetIfcEntityList(model)) {
    const name = api.GetNameFromTypeCode(type).toUpperCase()
    const ids = api.GetLineIDsWithType(model, type)
    const lines: Line[] = []
    for (let i = 0; i < ids.size(); i++) lines.push(api.GetLine(model, ids.get(i), false))
    byClass.set(name, lines)
  }
}, 120_000)

afterAll(() => {
  if (model !== undefined) api?.CloseModel?.(model)
  api?.Dispose?.()
})

const of = (c: string): Line[] => byClass.get(c.toUpperCase()) ?? []

/** IFC-frame (Z-up) extents of one element's geometry. */
function extents(expressID: number): [[number, number], [number, number], [number, number]] {
  const mesh = api.GetFlatMesh(model, expressID)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let g = 0; g < mesh.geometries.size(); g++) {
    const placed = mesh.geometries.get(g)
    const m = placed.flatTransformation
    const geom = api.GetGeometry(model, placed.geometryExpressID)
    const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
    for (let i = 0; i < v.length; i += 6) {
      const w = [
        m[0] * v[i] + m[4] * v[i + 1] + m[8] * v[i + 2] + m[12],
        m[1] * v[i] + m[5] * v[i + 1] + m[9] * v[i + 2] + m[13],
        m[2] * v[i] + m[6] * v[i + 1] + m[10] * v[i + 2] + m[14],
      ]
      const ifc = [w[0], -w[2], w[1]]
      ifc.forEach((x, a) => { lo[a] = Math.min(lo[a], x); hi[a] = Math.max(hi[a], x) })
    }
    geom.delete()
  }
  return [[lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]]]
}

describe('the underground station the gallery ships', () => {
  it('ships at the size its card promises, as IFC4', () => {
    const demo = DEMO_MODELS.find((m) => m.id === 'metro-drassanes')!
    expect(demo.fileName).toBe(FILE)
    expect(statSync(path.join(DIR, FILE)).size).toBe(demo.sizeBytes)
    expect(api.GetModelSchema(model)).toBe('IFC4')
  })

  it('is georeferenced in ETRS89 / UTM 31N at the street', () => {
    const conv = of('IFCMAPCONVERSION')[0]
    expect(conv.Eastings.value).toBeCloseTo(431077.12, 1)
    expect(conv.Northings.value).toBeCloseTo(4580900.43, 1)
    expect(conv.OrthogonalHeight.value).toBeCloseTo(4.0)
    expect(str(of('IFCPROJECTEDCRS')[0].Name)).toBe('EPSG:25831')
  })

  it('says on every element that its depths are assumed', () => {
    const psets = of('IFCPROPERTYSET').filter((p) => str(p.Name) === 'IFCVO_Provenance')
    const products = of('IFCWALL').length + of('IFCSLAB').length + of('IFCSTAIR').length
      + of('IFCBUILDINGELEMENTPROXY').length
    expect(psets.length).toBe(products)
  })
})

describe('it is under the street', () => {
  it('everything but the stair heads is below the street, the base ~11 m down', () => {
    let minZ = Infinity
    for (const c of ['IFCWALL', 'IFCSLAB', 'IFCBUILDINGELEMENTPROXY']) {
      for (const el of of(c)) {
        const [, , z] = extents(el.expressID)
        expect(z[1]).toBeLessThanOrEqual(1e-6)
        minZ = Math.min(minZ, z[0])
      }
    }
    expect(minZ).toBeCloseTo(-11.4, 3)
  })

  it('the stairs run from the street down to the vestibule', () => {
    expect(of('IFCSTAIR').length).toBeGreaterThanOrEqual(1)
    for (const s of of('IFCSTAIR')) {
      const [, , z] = extents(s.expressID)
      expect(z[1]).toBeCloseTo(0, 3)
      expect(z[0]).toBeLessThan(-5.4)
    }
  })

  it('the roof slab is voided where each stair passes', () => {
    expect(of('IFCRELVOIDSELEMENT').length).toBe(of('IFCSTAIR').length)
  })
})

describe('it stands on the real platforms', () => {
  it('Via 1 is the OSM ring, at platform height', () => {
    const via1 = of('IFCSLAB').find((s) => str(s.Name) === 'Platform - Via 1')!
    const [x, y, z] = extents(via1.expressID)
    const xs = VIA_1.map((p) => p[0]), ys = VIA_1.map((p) => p[1])
    expect(x[0]).toBeCloseTo(Math.min(...xs), 1)
    expect(x[1]).toBeCloseTo(Math.max(...xs), 1)
    expect(y[0]).toBeCloseTo(Math.min(...ys), 1)
    expect(y[1]).toBeCloseTo(Math.max(...ys), 1)
    expect(z[1]).toBeCloseTo(-9.0, 3)
  })
})
