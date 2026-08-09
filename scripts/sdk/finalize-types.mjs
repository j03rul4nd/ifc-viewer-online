// Renames the tsc output to the name the hosted module advertises, and stamps a
// header so nobody hand-edits it again.
//
//   public/sdk/ifc-viewer-sdk.d.ts  →  public/sdk/ifc-viewer.es.d.ts
//
// Runs right after `tsc -p tsconfig.sdk.json`, as part of `npm run build:sdk`.

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EMITTED = resolve(ROOT, 'public/sdk/ifc-viewer-sdk.d.ts')
const TARGET = resolve(ROOT, 'public/sdk/ifc-viewer.es.d.ts')

if (!existsSync(EMITTED)) {
  console.error(`  ✗ SDK types: expected ${EMITTED} — did tsc -p tsconfig.sdk.json run?`)
  process.exit(1)
}

const header = [
  '// Type definitions for the IFC Viewer SDK (ifc-viewer.es.js).',
  '// GENERATED from src/sdk/ifc-viewer-sdk.ts by `npm run build:sdk` — do not edit.',
  '',
].join('\n')

writeFileSync(TARGET, header + readFileSync(EMITTED, 'utf8'), 'utf8')
rmSync(EMITTED)
console.log('  ✓ SDK types: public/sdk/ifc-viewer.es.d.ts')
