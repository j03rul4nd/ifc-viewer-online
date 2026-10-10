// ─── pinned SDK builds: immutable, identical, still understood ───────────────
// /sdk/<version>/ifc-viewer.es.js is served `immutable` for a year
// (vercel.json), and hosts pin it — BESCOF's product pages among them. Three
// things have to stay true for that to be safe, and none of them is visible
// in a diff review:
//
//  1. A published version's bytes never change (versions.json holds their
//     SRI hash; version-sdk.mjs only ever writes the CURRENT version).
//  2. The pinned copy of the current version IS the moving /sdk/ file — one
//     artifact, two paths — so pinning changes nothing but the URL.
//  3. The iframe is the live app, not a versioned one: every command a
//     published SDK sends must still have a handler in App.tsx, or an old
//     pinned page breaks the day a handler is renamed.
//
// Lives in scripts/ for node:fs.

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SDK = path.join(ROOT, 'public', 'sdk')
const manifest = JSON.parse(readFileSync(path.join(SDK, 'versions.json'), 'utf8')) as {
  latest: string
  versions: Record<string, Record<string, { path: string; integrity: string; bytes: number }>>
}
const sourceVersion = readFileSync(path.join(ROOT, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8').match(/SDK_VERSION\s*=\s*'([^']+)'/)?.[1]
const sri = (b: Buffer): string => 'sha384-' + createHash('sha384').update(b).digest('base64')

describe('pinned SDK builds', () => {
  it('the manifest\'s latest is the version in the source', () => {
    expect(manifest.latest).toBe(sourceVersion)
    expect(manifest.versions[manifest.latest]).toBeDefined()
  })

  it('every published file still has the bytes it was published with', () => {
    for (const [version, files] of Object.entries(manifest.versions)) {
      for (const [name, f] of Object.entries(files)) {
        const file = path.join(SDK, f.path)
        expect(existsSync(file), `${version}/${name}`).toBe(true)
        const bytes = readFileSync(file)
        expect(sri(bytes), `${version}/${name} changed after publishing — bump SDK_VERSION instead`).toBe(f.integrity)
        expect(bytes.length).toBe(f.bytes)
      }
    }
  })

  it('the current version\'s pinned file is the /sdk/ file, byte for byte', () => {
    for (const name of ['ifc-viewer.es.js', 'ifc-viewer.es.d.ts']) {
      const moving = readFileSync(path.join(SDK, name))
      const pinned = readFileSync(path.join(SDK, manifest.latest, name))
      expect(pinned.equals(moving), name).toBe(true)
    }
  })

  it('the live app still handles every command a published SDK sends', () => {
    const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
    const handled = new Set([...app.matchAll(/case '(ifcviewer:[a-z-]+)'/g)].map((m) => m[1]))
    for (const version of Object.keys(manifest.versions)) {
      const js = readFileSync(path.join(SDK, version, 'ifc-viewer.es.js'), 'utf8')
      const sent = new Set([...js.matchAll(/["'`](ifcviewer:[a-z-]+)["'`]/g)].map((m) => m[1]))
      expect(sent.size, version).toBeGreaterThan(10)
      const missing = [...sent].filter((c) => !handled.has(c))
      expect(missing, `SDK ${version} sends commands App.tsx no longer handles`).toEqual([])
    }
  })
})

describe('hosting rules for pinned paths (vercel.json)', () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
    rewrites: Array<{ source: string; destination: string }>
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  }

  it('serves /sdk/<version>/ immutable, cross-origin', () => {
    const rule = vercel.headers.find((h) => h.source.startsWith('/sdk/:version'))
    expect(rule).toBeDefined()
    const get = (k: string) => rule!.headers.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value
    expect(get('Cache-Control')).toMatch(/max-age=31536000.*immutable/)
    expect(get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('a version that does not exist is a 404, not the app\'s HTML', () => {
    const spa = vercel.rewrites.find((r) => r.destination === '/index.html')!
    expect(spa.source).toContain('sdk/[0-9]+[.][0-9]+[.][0-9]+')
  })
})
