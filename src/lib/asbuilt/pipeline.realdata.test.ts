// Real-IFC regression for per-element attribution (cloud → own surface).
// One element moved 50 mm, 5 mm noise, 25 % of elements never scanned, partial
// scans and random dropout, at several cloud densities. Before attribution the
// score was density dependent, neighbours masked the move and unscanned
// elements borrowed their neighbours' points.
//
// Skipped when the sample IFC is not present. Extra densities: AB_DENSITIES=2000,20000
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { IfcAPI } from 'web-ifc'
import { runAsBuilt } from './pipeline'
import { sampleSurface, seededRandom, type ElementGeometry } from './surface-sampling'

const IFC = 'public/models/barcelona-catalunya/endolla-pg-gracia.ifc'
const TOL = 0.02
const DENSITIES = (process.env.AB_DENSITIES ?? '2000,10000').split(',').map(Number)

describe.skipIf(!existsSync(IFC))('as-built attribution on a real IFC', () => {
  const elements: ElementGeometry[] = []
  beforeAll(async () => {
    const api = new IfcAPI(); await api.Init()
    const id = api.OpenModel(new Uint8Array(readFileSync(IFC)))
    const byId = new Map<number, { p: number[]; i: number[] }>()
    api.StreamAllMeshes(id, (mesh) => {
      const e = byId.get(mesh.expressID) ?? { p: [], i: [] }; byId.set(mesh.expressID, e)
      for (let k = 0; k < mesh.geometries.size(); k++) {
        const pg = mesh.geometries.get(k), geo = api.GetGeometry(id, pg.geometryExpressID)
        const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
        const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize())
        const M = pg.flatTransformation, base = e.p.length / 3
        for (let j = 0; j < v.length; j += 6) {
          const x = v[j], y = v[j + 1], z = v[j + 2]
          e.p.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14])
        }
        for (const q of ix) e.i.push(q + base)
        geo.delete()
      }
    })
    for (const [eid, e] of byId) elements.push({ id: eid, ifcClass: api.GetLineType(id, eid) + '', positions: new Float32Array(e.p), indices: new Uint32Array(e.i) })
    api.CloseModel(id)
  }, 60_000)

  for (const density of DENSITIES) {
    it(`flags only the 50 mm move and keeps unscanned elements unobserved (density ${density}/m²)`, () => {
      const rand = seededRandom(3), g = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
      const sorted = [...elements].sort((a, b) => b.positions.length - a.positions.length)
      const moved = sorted[Math.floor(sorted.length / 4)]
      const cloud: Float32Array[] = []
      const unscanned = new Set<number>()
      for (const [k, e] of elements.entries()) {
        if (rand() < 0.25) { unscanned.add(e.id); continue }
        const s = sampleSurface(e, { density, minCount: 20, maxCount: 200_000, seed: 500 + k }).positions
        const keep: number[] = []
        const cut = rand()
        for (let j = 0; j < s.length; j += 3) {
          if (rand() < 0.3) continue
          if (cut < 0.3 && j / s.length > 0.6) continue
          const d = e === moved ? 0.05 : 0
          keep.push(s[j] + d + g() * 0.005, s[j + 1] + g() * 0.005, s[j + 2] + g() * 0.005)
        }
        cloud.push(new Float32Array(keep))
      }
      const r = runAsBuilt({ elements, cloud, toleranceM: TOL, alignmentRmseM: 0.005 })
      const m = r.elements.find((e) => e.id === moved.id)!
      const fp = r.elements.filter((e) => e.id !== moved.id && e.state === 'deviated')
      const unobs = r.elements.filter((e) => unscanned.has(e.id) && e.state === 'unobserved').length
      if (process.env.AB_LOG) {
        appendFileSync(process.env.AB_LOG, `density=${density} moved=#${moved.id} state=${m.state} p95=${((m.deviationP95 ?? NaN) * 1000).toFixed(1)}mm `
          + `fp=${fp.length} [${fp.map((e) => '#' + e.id + ':' + ((e.deviationP95 ?? 0) * 1000).toFixed(0)).join(',')}] unobserved=${unobs}/${unscanned.size}\n`)
      }
      expect(m.state).toBe('deviated')
      expect(m.deviationP95!).toBeGreaterThan(0.035)
      expect(m.deviationP95!).toBeLessThan(0.06)
      expect(fp.length).toBeLessThanOrEqual(2)
      expect(unobs).toBeGreaterThanOrEqual(unscanned.size - 5)
    }, 60_000)
  }
})
