// ─── generate-ifc-hierarchy.mjs ───────────────────────────────────────────────
// Emits src/lib/ids/ifc-hierarchy.ts: the IFC subtype→supertype map per schema
// family, parsed from web-ifc's bundled schema declarations
// (node_modules/web-ifc/ifc-schema.d.ts — `class IfcX extends IfcY` inside the
// per-schema namespaces). Run manually whenever web-ifc is upgraded:
//
//   node scripts/ids/generate-ifc-hierarchy.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dtsPath = path.resolve(here, '../../node_modules/web-ifc/ifc-schema.d.ts')
const outPath = path.resolve(here, '../../src/lib/ids/ifc-hierarchy.ts')

const webIfcVersion = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../node_modules/web-ifc/package.json'), 'utf8'),
).version

const SCHEMAS = ['IFC2X3', 'IFC4', 'IFC4X3']
const maps = Object.fromEntries(SCHEMAS.map((s) => [s, {}]))

let current = null
const nsRe = /^export declare namespace (IFC\w+)/
const clsRe = /class (Ifc\w+) extends (Ifc\w+)/
for (const line of fs.readFileSync(dtsPath, 'utf8').split('\n')) {
  const ns = nsRe.exec(line)
  if (ns) { current = SCHEMAS.includes(ns[1]) ? ns[1] : null; continue }
  if (!current) continue
  const m = clsRe.exec(line)
  if (!m) continue
  const parent = m[2].toUpperCase()
  // IfcLineObject is web-ifc's internal base class, not part of the IFC schema.
  if (parent === 'IFCLINEOBJECT') continue
  maps[current][m[1].toUpperCase()] = parent
}

for (const s of SCHEMAS) {
  const n = Object.keys(maps[s]).length
  if (n < 100) {
    console.error(`Suspiciously few classes for ${s}: ${n} — web-ifc layout changed? Aborting.`)
    process.exit(1)
  }
}

const emitMap = (obj) => {
  const keys = Object.keys(obj).sort()
  return `{\n${keys.map((k) => `    ${k}: '${obj[k]}',`).join('\n')}\n  }`
}

const out = `// ─── ifc-hierarchy.ts ─────────────────────────────────────────────────────────
// GENERATED FILE — do not edit. Regenerate with:
//   node scripts/ids/generate-ifc-hierarchy.mjs
// Source: web-ifc@${webIfcVersion} ifc-schema.d.ts (subtype → supertype per schema family).
// Pure data module (tree-shakable); import only from worker/test code paths.

export type IfcSchemaKey = ${SCHEMAS.map((s) => `'${s}'`).join(' | ')}

export const IFC_PARENT: Record<IfcSchemaKey, Record<string, string>> = {
${SCHEMAS.map((s) => `  ${s}: ${emitMap(maps[s])},`).join('\n')}
}

/** Upper-case parent chain of an IFC class (excluding itself), e.g. IFCWALL → [IFCBUILDINGELEMENT, …, IFCROOT]. */
export function parentChain(cls: string, schema: IfcSchemaKey = 'IFC4'): string[] {
  const map = IFC_PARENT[schema]
  const chain: string[] = []
  let cur = map[cls.toUpperCase()]
  for (let depth = 0; cur != null && depth < 32; depth++) {
    chain.push(cur)
    cur = map[cur]
  }
  return chain
}

/** True when \`cls\` equals or descends from \`ancestor\` in the given schema family. */
export function isSubtypeOf(cls: string, ancestor: string, schema: IfcSchemaKey = 'IFC4'): boolean {
  const a = cls.toUpperCase()
  const b = ancestor.toUpperCase()
  if (a === b) return true
  return parentChain(a, schema).includes(b)
}
`

fs.writeFileSync(outPath, out)
console.log(`ifc-hierarchy.ts: ${SCHEMAS.map((s) => `${s}=${Object.keys(maps[s]).length}`).join(', ')} classes → ${path.relative(process.cwd(), outPath)}`)
