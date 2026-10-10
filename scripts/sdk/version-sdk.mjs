// Publishes the SDK build at its pinned, immutable path, from the SAME bytes:
//
//   public/sdk/ifc-viewer.es.js      →  public/sdk/<version>/ifc-viewer.es.js
//   public/sdk/ifc-viewer.es.d.ts    →  public/sdk/<version>/ifc-viewer.es.d.ts
//
// and records every published version in public/sdk/versions.json with a
// Subresource-Integrity hash, so a host can pin both the URL and the content:
//
//   <script type="module" src="…/sdk/1.18.0/ifc-viewer.es.js" integrity="sha384-…" crossorigin>
//
// Only the CURRENT version (SDK_VERSION in src/sdk/ifc-viewer-sdk.ts) is ever
// written. Older version folders are left exactly as they are: they are
// served with `Cache-Control: immutable` (vercel.json), so a pinned URL must
// never change content. scripts/sdk-versions.test.ts fails if one does.
//
// Copies rather than builds twice: two builds of the same source are not
// guaranteed to be byte-identical, and the unversioned path and the pinned
// path must be the same file. The module works from both paths because it
// finds the app above `sdk/<version>/` (src/sdk/base-url.ts).
//
// Runs after finalize-types.mjs, as part of `npm run build:sdk`.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SDK_DIR = resolve(ROOT, 'public/sdk')
const FILES = ['ifc-viewer.es.js', 'ifc-viewer.es.d.ts']
const MANIFEST = resolve(SDK_DIR, 'versions.json')

const src = readFileSync(resolve(ROOT, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8')
const version = src.match(/SDK_VERSION\s*=\s*'([^']+)'/)?.[1]
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`  ✗ SDK versions: could not read a semver SDK_VERSION (got ${version ?? 'nothing'})`)
  process.exit(1)
}

const sri = (bytes) => 'sha384-' + createHash('sha384').update(bytes).digest('base64')

const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
  : { latest: version, versions: {} }

const outDir = resolve(SDK_DIR, version)
mkdirSync(outDir, { recursive: true })
const entry = {}
for (const f of FILES) {
  const from = resolve(SDK_DIR, f)
  if (!existsSync(from)) {
    console.error(`  ✗ SDK versions: ${f} is missing — did the SDK build run first?`)
    process.exit(1)
  }
  const bytes = readFileSync(from)
  writeFileSync(resolve(outDir, f), bytes)
  entry[f] = { path: `${version}/${f}`, integrity: sri(bytes), bytes: bytes.length }
}

manifest.latest = version
manifest.versions = { ...manifest.versions, [version]: entry }
// Newest first, so the file reads like a changelog.
const cmp = (a, b) => {
  const pa = a.split(/[.-]/).map((x) => (Number.isNaN(Number(x)) ? x : Number(x)))
  const pb = b.split(/[.-]/).map((x) => (Number.isNaN(Number(x)) ? x : Number(x)))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue
    if (pa[i] === undefined) return -1
    if (pb[i] === undefined) return 1
    return pa[i] > pb[i] ? -1 : 1
  }
  return 0
}
manifest.versions = Object.fromEntries(Object.entries(manifest.versions).sort(([a], [b]) => cmp(a, b)))
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
console.log(`  ✓ SDK versions: public/sdk/${version}/ (${entry['ifc-viewer.es.js'].integrity})`)
