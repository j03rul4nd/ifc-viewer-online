// ─── SDK docs coverage guard ──────────────────────────────────────────────────
// The published SDK reference at /sdk/ is NOT extracted from the source. The
// generator reads only the version out of `ifc-viewer-sdk.ts`; every method it
// lists, and every description in all ten languages, is hand-written in
// `scripts/sdk/build-sdk-docs.mjs`.
//
// That is a perfectly reasonable design — signature-first prose beats scraped
// JSDoc — but it has one failure mode, and the failure is silent: a method ships
// in the SDK, its types land in the published .d.ts, and the reference simply
// never mentions it. Nothing breaks. Nobody finds the method either.
//
// It had already happened. The whole point cloud surface went out in v1.8.0 and
// is absent from the docs; the mesh surface followed it in v1.10.0.
//
// So this test does not demand that everything be documented — that would fail
// today and get skipped tomorrow. It freezes the KNOWN gap and fails on anything
// new, which turns silent drift into a decision someone has to make.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// One level up, not two: this lives in scripts/, outside tsconfig.json's
// "include": ["src"]. A test using node:fs cannot sit under src/ — it fails
// tsc -b, and npm run build runs tsc -b before vite. Same reason
// scripts/repo-complete.test.ts is here.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Methods that exist in the SDK and are NOT in the reference pages.
 *
 * Adding to this list is a choice to ship an undocumented method. Removing from
 * it means the docs generator gained an entry — which needs all ten languages,
 * since the pages are fully localized.
 */
const KNOWN_UNDOCUMENTED = new Set([
  // Point clouds — shipped v1.8.0/v1.9.0, documented in docs/POINT_CLOUD.md only.
  'addPointCloud', 'addPointCloudFromUrl', 'listPointClouds', 'removePointCloud',
  'clearPointClouds', 'setPointCloudVisible', 'fitPointCloud', 'setPointCloudDisplay',
  'inspectPointCloud', 'setPointCloudPlacement', 'setPointCloudUpAxis',
  // Imported meshes — shipped v1.10.0, documented in docs/MESH_IMPORT.md only.
  'addMesh', 'addMeshFromUrl', 'listMeshes', 'removeMesh', 'clearMeshes',
  'setMeshVisible', 'fitMesh', 'setMeshPlacement', 'setMeshUpAxis', 'setMeshUnit',
])

/** Plumbing, not API. */
const INTERNAL = new Set(['constructor', 'request', 'onMessage', 'post'])

function publicMethods(): string[] {
  const src = readFileSync(resolve(ROOT, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8')
  const from = src.indexOf('export class IfcViewer {')
  const to = src.indexOf('\nexport class IfcViewerElement')
  const body = src.slice(from, to > from ? to : undefined)
  // Two-space indentation is a class member; anything deeper is inside one.
  const names = [...body.matchAll(/^ {2}([a-z][A-Za-z0-9]*)\s*[(<]/gm)].map((m) => m[1])
  return [...new Set(names)].filter((n) => !INTERNAL.has(n))
}

describe('SDK reference coverage', () => {
  const docs = readFileSync(resolve(ROOT, 'scripts/sdk/build-sdk-docs.mjs'), 'utf8')
  const methods = publicMethods()

  it('finds the SDK surface at all', () => {
    // Guards the parse itself: if the class shape changes and this drops to a
    // handful of names, every assertion below would pass for the wrong reason.
    expect(methods.length).toBeGreaterThan(30)
    expect(methods).toContain('addFromUrl')
    expect(methods).toContain('isolate')
  })

  it('documents every method that is not on the known-gap list', () => {
    const undocumented = methods.filter(
      (n) => !docs.includes(`'${n}'`) && !docs.includes(`${n}(`),
    )
    const unexpected = undocumented.filter((n) => !KNOWN_UNDOCUMENTED.has(n))
    expect(
      unexpected,
      'These SDK methods ship with no entry in the reference pages. Either add\n' +
      'them to scripts/sdk/build-sdk-docs.mjs (all ten languages) or add them to\n' +
      'KNOWN_UNDOCUMENTED here, deliberately:\n' +
      unexpected.map((n) => '  ' + n).join('\n'),
    ).toEqual([])
  })

  it('keeps the known gap honest — no stale entries', () => {
    // A name that got documented must leave the list, or the list stops meaning
    // anything and the next real gap hides inside it.
    const stale = [...KNOWN_UNDOCUMENTED].filter(
      (n) => docs.includes(`'${n}'`) || docs.includes(`${n}(`),
    )
    expect(
      stale,
      `These are documented now and should be removed from KNOWN_UNDOCUMENTED:\n${stale.join('\n')}`,
    ).toEqual([])
  })

  it('does not list a method that no longer exists', () => {
    const gone = [...KNOWN_UNDOCUMENTED].filter((n) => !methods.includes(n))
    expect(gone, `KNOWN_UNDOCUMENTED names methods that are gone:\n${gone.join('\n')}`).toEqual([])
  })
})
