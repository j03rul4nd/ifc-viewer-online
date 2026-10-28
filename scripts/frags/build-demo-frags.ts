// ─── Prebuilt fragments for the models we ship ────────────────────────────────
//
// Every IFC under public/models is converted HERE, once, with the same
// importer settings the browser uses (src/workers/ifc-parser.worker.ts), and
// written to public/models-frag/<sha>.frag next to a manifest keyed by the
// fingerprint the loader already computes for any file (lib/loading/fingerprint).
//
// Why: converting is the heaviest thing the app does — web-ifc parses the file
// twice and the importer builds the geometry in JS arrays, about five times the
// file size at its peak. On an iPhone that peak shares one capped process with
// the viewer, the map and the GPU, and a 90 MB tower is past it. With a prebuilt
// .frag the device downloads the finished geometry and skips the conversion:
// faster on every machine, and the only way the big demos load on a phone.
//
// The manifest is matched by CONTENT, not by URL, so it serves the gallery, the
// scenes, the embeds and a visitor dropping the same file alike. An IFC that
// changes gets a new fingerprint and simply converts in the browser until this
// script runs again — a stale manifest can cost speed, never correctness.
//
//   npm run frags            convert what changed
//   npm run frags -- --force convert everything

import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises'
import { join, relative, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { IfcImporter } from '@thatopen/fragments'
import { addImporterClasses } from '../../src/lib/ifc-importer-classes'
import { hasFarCoordinates } from '../../src/lib/ifc-far-coordinates'
import { fingerprintBytes } from '../../src/lib/loading/fingerprint'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODELS = join(ROOT, 'public', 'models')
const OUT = join(ROOT, 'public', 'models-frag')
const MANIFEST = join(OUT, 'manifest.json')
const WASM_DIR = join(ROOT, 'node_modules', 'web-ifc') + '/'
const SKIPPED_FAR_RE = /meters away from the origin and will be skipped/

export interface FragManifest {
  version: 1
  /** fingerprint (lib/loading/fingerprint) → file under /models-frag/ */
  entries: Record<string, { frag: string; ifc: string; ifcBytes: number; fragBytes: number; tree?: string }>
}

// ── Spatial tree, from the validator worker itself ────────────────────────────
// After the geometry the loader builds the spatial tree: another full web-ifc
// parse, in the validator worker. Shipping it too means a phone loading one of
// these models never opens the IFC with web-ifc at all. The worker module is
// driven here as it is in the browser — same code, so the same tree.

type TreeReply = { type: string; id: string; tree?: unknown; decomp?: unknown; message?: string }
let workerHandler: ((e: { data: unknown }) => void) | null = null
const replies = new Map<string, (m: TreeReply) => void>()

async function loadValidatorWorker(): Promise<void> {
  if (workerHandler) return
  const { IfcAPI } = await import('web-ifc')
  // The worker points web-ifc at the app's base URL; in Node it lives here.
  const setPath = IfcAPI.prototype.SetWasmPath
  IfcAPI.prototype.SetWasmPath = function (this: InstanceType<typeof IfcAPI>) {
    return setPath.call(this, WASM_DIR, true)
  }
  ;(globalThis as unknown as { self: unknown }).self = {
    postMessage: (m: TreeReply) => replies.get(m.id)?.(m),
  }
  await import('../../src/workers/validator.worker.ts')
  workerHandler = (globalThis as unknown as { self: { onmessage: (e: { data: unknown }) => void } }).self.onmessage
}

async function buildTree(bytes: Uint8Array): Promise<{ tree: unknown; decomp: unknown }> {
  await loadValidatorWorker()
  const id = `tree-${Math.random().toString(36).slice(2)}`
  const buffer = bytes.slice().buffer
  return new Promise((resolve, reject) => {
    let tree: unknown = null
    let decomp: unknown = null
    replies.set(id, (m) => {
      if (m.type === 'tree') { tree = m.tree; decomp = m.decomp ?? null }
      else if (m.type === 'tree-done') { replies.delete(id); resolve({ tree, decomp }) }
      else if (m.type === 'error') { replies.delete(id); reject(new Error(m.message)) }
    })
    workerHandler!({ data: { type: 'build-tree', id, buffer } })
  })
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(p))
    else if (/\.ifc$/i.test(e.name)) out.push(p)
  }
  return out
}

async function convertOnce(bytes: Uint8Array, toOrigin: boolean): Promise<{ binary: Uint8Array; skipped: number }> {
  const importer = new IfcImporter()
  addImporterClasses(importer)
  importer.webIfcSettings = { ...importer.webIfcSettings, COORDINATE_TO_ORIGIN: toOrigin }
  importer.wasm = { path: WASM_DIR, absolute: true }
  let skipped = 0
  const warn = console.warn
  const log = console.log
  const watch = (orig: (...a: unknown[]) => void) => (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && SKIPPED_FAR_RE.test(args[0])) { skipped++; return }
    orig.apply(console, args)
  }
  console.warn = watch(warn)
  console.log = watch(log)
  try {
    const binary = await importer.process({ bytes })
    return { binary, skipped }
  } finally {
    console.warn = warn
    console.log = log
  }
}

/** The worker's convert(), step for step: far models go to the origin, and a silent drop converts again. */
async function convert(bytes: Uint8Array): Promise<Uint8Array> {
  const far = hasFarCoordinates(bytes)
  const first = await convertOnce(bytes, far)
  if (!far && first.skipped > 0) return (await convertOnce(bytes, true)).binary
  return first.binary
}

async function readManifest(): Promise<FragManifest> {
  try {
    const m = JSON.parse(await readFile(MANIFEST, 'utf8')) as FragManifest
    if (m.version === 1 && m.entries) return m
  } catch { /* first run */ }
  return { version: 1, entries: {} }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  await mkdir(OUT, { recursive: true })
  const old = await readManifest()
  const next: FragManifest = { version: 1, entries: {} }
  const files = (await walk(MODELS)).sort()
  let converted = 0
  for (const file of files) {
    const rel = relative(join(ROOT, 'public'), file).replace(/\\/g, '/')
    const bytes = new Uint8Array(await readFile(file))
    const fp = await fingerprintBytes(bytes)
    // Named by their CONTENT: the files are served immutable (vercel.json),
    // so a reconversion (a new importer) must get a new URL, never the old one.
    const prev = old.entries[fp]
    const has = (f: string | undefined): Promise<boolean> =>
      f ? stat(join(OUT, f)).then((s) => s.size > 0, () => false) : Promise.resolve(false)
    if (!force && prev && await has(prev.frag) && await has(prev.tree)) {
      next.entries[fp] = { ...prev, ifc: rel }
      continue
    }
    const t0 = Date.now()
    const frag = await convert(bytes)
    const id = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex').slice(0, 16)
    const name = `${id(frag)}.frag`
    await writeFile(join(OUT, name), frag)
    const { tree, decomp } = await buildTree(bytes)
    const treeJson = JSON.stringify({ tree, decomp })
    const treeName = `${id(treeJson)}.tree.json`
    await writeFile(join(OUT, treeName), treeJson)
    next.entries[fp] = { frag: name, ifc: rel, ifcBytes: bytes.byteLength, fragBytes: frag.byteLength, tree: treeName }
    converted++
    console.log(`${rel}: ${(bytes.byteLength / 1e6).toFixed(1)} MB → ${(frag.byteLength / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  }
  // Fragments no IFC points at any more.
  const keep = new Set(Object.values(next.entries).flatMap((e) => [e.frag, e.tree ?? '']))
  for (const e of await readdir(OUT)) {
    if ((e.endsWith('.frag') || e.endsWith('.tree.json')) && !keep.has(e)) await rm(join(OUT, e))
  }
  await writeFile(MANIFEST, JSON.stringify(next, null, 1) + '\n')
  console.log(`${files.length} IFC, ${converted} converted, manifest: ${Object.keys(next.entries).length} entries`)
}

await main()
