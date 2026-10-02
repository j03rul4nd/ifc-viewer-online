// ─── map coordinates in the geometry, through the REAL converter ──────────────
// The bug this pins was invisible to every unit test: web-ifc and fragments
// each did something reasonable, and together they produced a model with a
// tree, properties and no geometry at all. Only the real pipeline shows it, so
// this runs the real one — web-ifc's WASM and fragments' IfcImporter — on a
// file shaped like a Civil 3D export: an IfcFacetedBrep whose vertices carry
// UTM, every placement at zero, no IfcMapConversion.
//
// Synthetic on purpose: the file that exposed it belongs to a client project.
// See docs/FAR_COORDINATES.md.
//
// Lives in scripts/ for the reason repo-complete.test.ts explains: it needs
// node:fs, and tsconfig.json's browser program has no @types/node.

import { describe, it, expect } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { IfcImporter } from '@thatopen/fragments'
import path from 'path'
import { hasFarCoordinates } from '../src/lib/ifc-far-coordinates'
import { civil3dBox } from './far-coordinates-fixture'

const WASM = path.join(process.cwd(), 'node_modules', 'web-ifc') + path.sep

const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s)

/** Convert with the real importer; count the elements it drops for distance. */
async function convert(bytes: Uint8Array, toOrigin: boolean): Promise<{ skipped: number; size: number }> {
  const importer = new IfcImporter()
  importer.wasm = { path: WASM, absolute: true }
  importer.webIfcSettings = { ...importer.webIfcSettings, COORDINATE_TO_ORIGIN: toOrigin }
  // fragments reports a dropped element with console.log; watch warn as well.
  const warn = console.warn
  const log = console.log
  let skipped = 0
  const watch = (f: (...a: unknown[]) => void) => (...a: unknown[]): void => {
    if (String(a[0]).includes('will be skipped')) skipped++
    else f(...a)
  }
  console.warn = watch(warn)
  console.log = watch(log)
  try {
    const out = await importer.process({ bytes })
    return { skipped, size: out.byteLength }
  } finally {
    console.warn = warn
    console.log = log
  }
}

/** The shift web-ifc applies, in web-ifc's own (y-up) axes. */
async function coordination(bytes: Uint8Array): Promise<number[]> {
  const api = new IfcAPI()
  api.SetWasmPath(WASM, true)
  await api.Init()
  const id = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
  api.StreamAllMeshes(id, () => { /* the shift is fixed by the first mesh */ })
  const m = api.GetCoordinationMatrix(id)
  api.CloseModel(id)
  return [m[12], m[13], m[14]]
}

describe('map coordinates in the geometry (real web-ifc + fragments)', () => {
  const road = bytesOf(civil3dBox(412_700, 4_593_500, 150))

  it('is detected, in metres and in millimetres, and a local model is not', () => {
    expect(hasFarCoordinates(road)).toBe(true)
    expect(hasFarCoordinates(bytesOf(civil3dBox(412_700, 4_593_500, 150, '.MILLI.')))).toBe(true)
    expect(hasFarCoordinates(bytesOf(civil3dBox(10, 20, 0, '.MILLI.')))).toBe(false)
  })

  it('keeping the coordinates, the importer drops the element: the original bug', async () => {
    const { skipped } = await convert(road, false)
    expect(skipped).toBeGreaterThan(0)
  }, 60_000)

  it('moved to the origin, nothing is dropped', async () => {
    const { skipped, size } = await convert(road, hasFarCoordinates(road))
    expect(skipped).toBe(0)
    expect(size).toBeGreaterThan(0)
  }, 60_000)

  it('negative map coordinates are not dropped by the importer, but still caught', async () => {
    // fragments compares `x > threshold` without abs(): a model west of a false
    // origin (negative E; in web-ifc axes z = −N is negative too) is kept and
    // drawn 4 600 km out, shimmering. The scan uses |x|.
    const west = bytesOf(civil3dBox(-412_700, 4_593_500, 150))
    expect((await convert(west, false)).skipped).toBe(0)
    expect(hasFarCoordinates(west)).toBe(true)
  }, 60_000)

  it('two files of one site get shifts that differ by exactly their real offset', async () => {
    // What the scene datum reconciles: each file is moved by its own first mesh.
    const drain = bytesOf(civil3dBox(412_730, 4_593_520, 150))
    const [a, b] = await Promise.all([coordination(road), coordination(drain)])
    // web-ifc axes: x = E, y = H, z = −N; the shift is minus the position.
    expect(a[0] - b[0]).toBeCloseTo(30, 6)
    expect(a[2] - b[2]).toBeCloseTo(-20, 6)
    expect(Math.abs(a[0])).toBeGreaterThan(412_000)
  }, 60_000)
})
