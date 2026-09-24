// ─── showcase asset checks ────────────────────────────────────────────────────
// Runs on the Node side, where the files actually are: the browser tests mock
// the loader and can say nothing about what got committed. These guard the
// promise the UI makes about the download.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'fs'
import path from 'path'
import { PROP_ASSETS, PROP_ASSETS_KB } from '../../src/lib/geo/props-assets'

describe('the assets on disk', () => {
  const dir = path.join(process.cwd(), 'public', 'models', 'props')

  it('ships every asset the code asks for', () => {
    for (const name of PROP_ASSETS) {
      expect(existsSync(path.join(dir, `${name}.glb`)), `${name}.glb missing`).toBe(true)
    }
  })

  it('matches the download the UI promises, in both directions', () => {
    const total = PROP_ASSETS.reduce(
      (n, name) => n + statSync(path.join(dir, `${name}.glb`)).size, 0,
    ) / 1024
    // The panel quotes a size. Drifting past it is a broken promise — but so is
    // sitting well under it, which is what a one-sided check lets through: the
    // first number here was 116 KB for 93 KB of files and no test minded.
    expect(total).toBeLessThanOrEqual(PROP_ASSETS_KB * 1.1)
    expect(total).toBeGreaterThanOrEqual(PROP_ASSETS_KB * 0.9)
  })

  it('is real glTF binary, not a stub someone committed', () => {
    for (const name of PROP_ASSETS) {
      const head = readFileSync(path.join(dir, `${name}.glb`)).subarray(0, 4).toString('ascii')
      expect(head, `${name}.glb`).toBe('glTF')
    }
  })
})

describe('the assets are the size of the real thing', () => {
  const dir = path.join(process.cwd(), 'public', 'models', 'props')

  /** Extent of the GLB's first mesh, in metres, straight out of the buffers. */
  function extents(name: string): { x: number; y: number; z: number } {
    const buf = readFileSync(path.join(dir, `${name}.glb`))
    // Minimal glTF read: the JSON chunk's accessor min/max is authoritative and
    // saves pulling a full loader (and a DOM) into a Node test.
    const jsonLength = buf.readUInt32LE(12)
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const mesh of gltf.meshes) {
      for (const prim of mesh.primitives) {
        const acc = gltf.accessors[prim.attributes.POSITION]
        for (let i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], acc.min[i])
          hi[i] = Math.max(hi[i], acc.max[i])
        }
      }
    }
    return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] }
  }

  // Blender is exported Z-up, so z is height. These are the dimensions a tape
  // measure would give, and they are what the placement code assumes: a lamp
  // scaled by metresToNormalized has to come out 7 m tall, not 7 cm or 70 m.
  const EXPECTED: Record<string, [number, number, number]> = {
    bench:             [1.80, 0.63, 0.91],
    bollard:           [0.24, 0.24, 0.93],
    'bus-shelter':     [4.30, 1.80, 2.37],
    car:               [4.10, 1.84, 1.49],
    van:               [5.45, 2.08, 2.10],
    bus:               [11.95, 2.84, 2.99],
    'traffic-signal':  [0.55, 0.54, 3.95],
    'catenary-mast':   [3.60, 0.60, 8.01],
    'train-carriage':  [19.00, 2.925, 4.216],
    'train-cab':       [19.018, 2.925, 4.216],
    'tree-broadleaf':  [3.84, 3.52, 6.15],
    'tree-blossom':    [3.65, 3.23, 4.95],
    'tree-columnar':   [1.76, 1.72, 7.63],
    'tree-conifer':    [3.50, 3.50, 7.10],
    'tree-olive':      [4.04, 4.04, 3.69],
    'tree-palm':       [4.29, 4.29, 6.65],
    'street-lamp':     [2.02, 0.32, 7.67],
    'platform-canopy': [11.80, 6.39, 3.93],
    'litter-bin':      [0.63, 0.70, 0.95],
    'roof-chimney':    [0.74, 0.74, 1.76],
    'roof-hvac':       [2.77, 1.65, 1.38],
    'roof-stairbox':   [3.30, 2.80, 3.39],
    'roof-tank':       [1.60, 1.68, 2.82],
    // Round 3, Barcelona. All face +X, so x is the depth toward the street.
    'bench-bcn':          [0.59, 1.80, 0.86],
    'lamp-park-bcn':      [0.46, 0.47, 4.29],
    'lamp-street-bcn':    [3.37, 0.32, 9.65],
    'fountain-bcn':       [0.79, 0.60, 1.79],
    'ped-signal':         [0.41, 0.26, 2.83],
    'traffic-signal-bcn': [0.52, 0.32, 3.53],
    'waste-basket-bcn':   [0.40, 0.36, 0.92],
    // Round 4, moored boats. Bow toward +X, so x is length overall (motor
    // includes the swim platform, sail the stemhead fitting); y is the beam
    // plus the fenders hung on both sides; z runs from the bottom of the hull,
    // BELOW the waterline, to the top (the sailing yacht's masthead).
    'boat-motor':         [10.65, 3.63, 4.16],
    'boat-sail':          [11.10, 3.77, 16.75],
    'boat-small':         [6.07, 2.27, 1.70],
  }

  /** Boats are authored with z = 0 at the WATERLINE, not the ground. */
  const isBoat = (name: string) => name.startsWith('boat-')

  it('measures every asset, so a new one cannot skip the check', () => {
    // Iterating the table would let an asset added to PROP_ASSETS but not to
    // EXPECTED sail through untested — which is exactly how the broken lamp
    // survived its first release.
    expect(Object.keys(EXPECTED).sort()).toEqual([...PROP_ASSETS].sort())
  })

  it('measures up, within a fifth of the intended size', () => {
    for (const [name, want] of Object.entries(EXPECTED)) {
      const got = extents(name)
      const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
      axes.forEach((axis, i) => {
        // Generous: this catches a unit slip or a runaway modifier, not a
        // deliberate restyle. A 20% band still fails an order of magnitude.
        expect(got[axis], `${name}.${axis} = ${got[axis].toFixed(2)} m`)
          .toBeGreaterThan(want[i] * 0.8)
        expect(got[axis], `${name}.${axis} = ${got[axis].toFixed(2)} m`)
          .toBeLessThan(want[i] * 1.2)
      })
    }
  })

  function gltfJson(name: string) {
    const buf = readFileSync(path.join(dir, `${name}.glb`))
    return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
  }

  function minZ(name: string): number {
    const gltf = gltfJson(name)
    let lo = Infinity
    for (const mesh of gltf.meshes) {
      for (const prim of mesh.primitives) {
        lo = Math.min(lo, gltf.accessors[prim.attributes.POSITION].min[2])
      }
    }
    return lo
  }

  it('stands on the ground — nothing is authored floating or buried', () => {
    for (const name of Object.keys(EXPECTED)) {
      // Boats are the documented exception: see the next test.
      if (isBoat(name)) continue
      const z = minZ(name)
      // The build drops every asset to z = 0 so the placement code can put it
      // on the terrain sample without knowing anything about the model.
      expect(Math.abs(z), `${name} base at z = ${z}`).toBeLessThan(0.02)
    }
  })

  // A boat's z = 0 is the WATERLINE (build-props.py, "Round 4"), so its hull
  // must reach below it. A boat that got dropped to min z = 0 like the street
  // props would sit ON the water like a toy, and would pass the test above.
  it('floats — the waterline plane z = 0 cuts every boat hull', () => {
    const boats = Object.keys(EXPECTED).filter(isBoat)
    expect(boats.length).toBeGreaterThan(0)
    for (const name of boats) {
      const z = minZ(name)
      expect(z, `${name} hull bottom at z = ${z}`).toBeGreaterThan(-1.2)
      expect(z, `${name} hull bottom at z = ${z}`).toBeLessThan(-0.2)
    }
  })

  // props-assets.ts loadOne() skips the re-grounding for 'boat-*' and bakes the
  // node transform in. That is only exact while the node carries nothing — the
  // bake_origin=True the builders use. A translated node would move the
  // waterline by exactly that much, and no extent check could tell.
  it('ships every boat with an identity node, so its authored waterline survives the loader', () => {
    for (const name of Object.keys(EXPECTED).filter(isBoat)) {
      for (const node of gltfJson(name).nodes) {
        expect(node.translation ?? [0, 0, 0], `${name} node translation`).toEqual([0, 0, 0])
        expect(node.rotation ?? [0, 0, 0, 1], `${name} node rotation`).toEqual([0, 0, 0, 1])
        expect(node.scale ?? [1, 1, 1], `${name} node scale`).toEqual([1, 1, 1])
        expect(node.matrix, `${name} node matrix`).toBeUndefined()
      }
    }
  })
})
