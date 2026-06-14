// ─── ids-testcases.test.ts ────────────────────────────────────────────────────
// Golden suite: the curated buildingSMART IDS test cases (see ids-fixtures/
// FIXTURES.md) run through the REAL pipeline — parseIds → gatherIdsElements
// (web-ifc Node build) → runIdsChecks. Expected outcome is encoded in the file
// name (`pass-*` / `fail-*`); cases the engine cannot satisfy yet are `it.todo`
// tagged with the IDS_IMPLEMENTATION_PLAN task that enables them.
//
// Compliance semantics (FIXTURES.md): a model passes an IDS when no spec has
// status 'fail' — 'na' counts as compliant until spec cardinality lands (P2-3).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { parseIds } from './ids-parser'
import { runIdsChecks } from './ids-engine'
import { gatherIdsElements } from './ids-gather'
import type { IdsResult } from './ids-types'
import manifestRaw from './ids-fixtures/manifest.json?raw'

// Fixtures are loaded through Vite's glob (no node:fs — keeps the browser-only
// tsconfig clean). IFC SPF is a text format, so raw string → UTF-8 bytes is a
// faithful round-trip for web-ifc.
const idsFiles = import.meta.glob('./ids-fixtures/**/*.ids', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ifcFiles = import.meta.glob('./ids-fixtures/**/*.ifc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

interface ManifestCase { file: string; todo?: string }
const manifest = JSON.parse(manifestRaw) as { commit: string; cases: ManifestCase[] }

function fixture(map: Record<string, string>, rel: string): string {
  const content = map[`./ids-fixtures/${rel}`]
  if (content == null) throw new Error(`Fixture not found: ${rel} — run node scripts/ids/fetch-testcases.mjs`)
  return content
}

let api: IfcAPI

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
}, 30_000)

afterAll(() => {
  api?.Dispose?.()
})

async function runCase(file: string): Promise<IdsResult> {
  const idsXml = fixture(idsFiles, `${file}.ids`)
  const ifcBytes = new TextEncoder().encode(fixture(ifcFiles, `${file}.ifc`))
  const doc = parseIds(idsXml)
  const modelId = api.OpenModel(ifcBytes)
  try {
    const elements = await gatherIdsElements(api, modelId, doc)
    // Real model schema → the ifcVersion gate (P2-4) is exercised by every case.
    return runIdsChecks(doc, elements, { modelSchema: api.GetModelSchema(modelId) })
  } finally {
    api.CloseModel(modelId)
  }
}

function expectedOf(file: string): 'pass' | 'fail' {
  const base = file.split('/').pop() ?? ''
  if (base.startsWith('pass-')) return 'pass'
  if (base.startsWith('fail-')) return 'fail'
  throw new Error(`Unexpected fixture prefix: ${file}`)
}

describe('buildingSMART IDS test cases (golden)', () => {
  for (const c of manifest.cases) {
    const expected = expectedOf(c.file)
    const title = `${c.file} → ${expected}`

    if (c.todo) {
      it.todo(`[${c.todo}] ${title}`)
      continue
    }

    it(title, async () => {
      const result = await runCase(c.file)
      const complies = result.specs.every((s) => s.status !== 'fail')
      if (expected === 'pass') {
        expect(complies, failureDump(result)).toBe(true)
      } else {
        expect(complies, 'expected at least one failed specification').toBe(false)
      }
    })
  }
})

function failureDump(result: IdsResult): string {
  const failed = result.specs.filter((s) => s.status === 'fail')
  return failed
    .map((s) => `${s.name}: ${s.failures.map((f) => `#${f.expressId} ${f.reasons.map((r) => r.code).join(',')}`).join('; ')}`)
    .join(' | ')
}
