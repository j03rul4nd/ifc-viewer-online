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
    car:               [4.10, 1.84, 1.49],
    van:               [5.45, 2.08, 2.10],
    'train-carriage':  [19.00, 2.92, 4.02],
    'tree-broadleaf':  [3.84, 3.52, 6.15],
    'tree-conifer':    [3.50, 3.50, 7.10],
    'street-lamp':     [2.02, 0.32, 7.67],
    'platform-canopy': [11.80, 6.39, 3.93],
  }

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

  it('stands on the ground — nothing is authored floating or buried', () => {
    for (const name of Object.keys(EXPECTED)) {
      const buf = readFileSync(path.join(dir, `${name}.glb`))
      const gltf = JSON.parse(
        buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'),
      )
      let minZ = Infinity
      for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
          minZ = Math.min(minZ, gltf.accessors[prim.attributes.POSITION].min[2])
        }
      }
      // The build drops every asset to z = 0 so the placement code can put it
      // on the terrain sample without knowing anything about the model.
      expect(Math.abs(minZ), `${name} base at z = ${minZ}`).toBeLessThan(0.02)
    }
  })
})
