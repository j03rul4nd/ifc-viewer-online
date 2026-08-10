// ─── demo mesh table ──────────────────────────────────────────────────────────
// The numbers on these cards were measured by running each file through this
// app's own loader in a browser, and they are shown to users as fact. This
// guards the SHAPE of that table — the parts that rot silently when someone adds
// an entry by copying an existing one.
//
// It deliberately does not fetch anything. A network test here would be flaky in
// CI and would prove availability rather than correctness; the measurement is a
// manual step recorded in the module header, and re-measuring is what an entry
// change calls for.

import { describe, it, expect } from 'vitest'
import { DEMO_MESHES, formatDemoSize } from './meshes'

const EXT_OF = (url: string): string => {
  const name = url.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

describe('demo mesh table', () => {
  it('has unique ids and description keys', () => {
    const ids = DEMO_MESHES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    const keys = DEMO_MESHES.map((d) => d.descriptionKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('lists the ENTRY file first in every set', () => {
    // The loader picks the first recognised model in the list, and a .bin ahead
    // of the .gltf would have it parse a buffer as a model. Order is load-bearing
    // here, not cosmetic.
    for (const demo of DEMO_MESHES) {
      expect(['.glb', '.gltf', '.obj'], `${demo.id} entry`).toContain(EXT_OF(demo.urls[0]))
    }
  })

  it('ships every companion a multi-file model needs', () => {
    // A .gltf without its .bin is grey geometry and an .obj without its .mtl is
    // untextured — a demo that shipped only the entry file would demonstrate the
    // failure rather than the feature.
    for (const demo of DEMO_MESHES) {
      const exts = demo.urls.map(EXT_OF)
      if (exts[0] === '.gltf') {
        expect(exts, `${demo.id} needs its buffer`).toContain('.bin')
      }
      if (exts[0] === '.obj') {
        expect(exts, `${demo.id} needs its materials`).toContain('.mtl')
      }
    }
  })

  it('uses https and only hosts that are known to allow CORS', () => {
    // Verified per URL when each was added. A new host has to be checked, not
    // assumed — the browser fetches these directly.
    const ALLOWED = ['raw.githubusercontent.com']
    for (const demo of DEMO_MESHES) {
      for (const url of demo.urls) {
        expect(url.startsWith('https://'), url).toBe(true)
        expect(ALLOWED.some((h) => url.includes(h)), `${url} is on an unverified host`).toBe(true)
      }
    }
  })

  it('carries attribution, because these are other people’s models', () => {
    for (const demo of DEMO_MESHES) {
      expect(demo.license.trim().length, `${demo.id} license`).toBeGreaterThan(0)
      expect(demo.source.trim().length, `${demo.id} source`).toBeGreaterThan(0)
    }
  })

  it('declares plausible measured figures', () => {
    for (const demo of DEMO_MESHES) {
      expect(demo.triangles, `${demo.id} triangles`).toBeGreaterThan(0)
      expect(demo.totalBytes, `${demo.id} bytes`).toBeGreaterThan(0)
      expect(demo.textures, `${demo.id} textures`).toBeGreaterThanOrEqual(0)
      // A model with textures must account for them; one without must not claim
      // texture memory it does not use.
      if (demo.textures === 0) expect(demo.textureBytes, demo.id).toBe(0)
    }
  })

  it('stays inside the triangle budget, together', () => {
    // Someone will eventually add a demo that alone exhausts the budget, and the
    // failure would be a toast rather than anything explanatory.
    const total = DEMO_MESHES.reduce((n, d) => n + d.triangles, 0)
    expect(total).toBeLessThan(1_000_000)
  })

  it('covers the cases the importer can fail on', () => {
    // The table earns its place by exercising distinct paths, not by being long.
    const kinds = new Set(DEMO_MESHES.map((d) => d.kind))
    expect(kinds).toContain('draco')        // cannot parse without a decoder
    expect(kinds).toContain('corrections')  // arrives wrong, on purpose
    expect(DEMO_MESHES.some((d) => d.urls.length > 1)).toBe(true)
    expect(DEMO_MESHES.some((d) => EXT_OF(d.urls[0]) === '.obj')).toBe(true)
  })
})

describe('formatDemoSize', () => {
  it('reads at a glance', () => {
    expect(formatDemoSize(1_664)).toBe('2 KB')
    expect(formatDemoSize(30_467)).toBe('30 KB')
    expect(formatDemoSize(3_773_916)).toBe('3.8 MB')
  })

  it('never shows a zero for a file that exists', () => {
    expect(formatDemoSize(200)).toBe('1 KB')
  })
})
