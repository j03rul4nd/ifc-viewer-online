// @vitest-environment node
// RULE_EMPTY_PROPERTY_VALUE folds every element with the same empty
// (pset, property) into one issue, named after one of them — and that
// element's GlobalId is the issue's identity for the run diff and for waivers.
// A re-saved file (an export with edits) lists its entities in another order,
// so the choice must not depend on order: the same file written two ways has
// to give the same issue, or a batch fix reports "cleared + new" for an issue
// it never touched and a waiver on it stops applying to the fixed file.
//
// Real web-ifc (the Node build) on a hand-written file: the rule's behaviour
// is in how it walks web-ifc's line lists, which a mock would not have.

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { DEFAULT_RULES } from '../types'
import type { ValidationIssue, ValidationResult } from '../types'

// The worker points web-ifc at the app's served WASM; in Node the package
// finds its own.
vi.mock('web-ifc', async (orig) => {
  const m = await orig<typeof import('web-ifc')>()
  class IfcAPI extends m.IfcAPI { SetWasmPath(): void { /* Node default */ } }
  return { ...m, IfcAPI }
})

type Reply = { type: string; id: string; result?: ValidationResult; message?: string }
const replies: Reply[] = []

beforeAll(async () => {
  const g = globalThis as unknown as { self: unknown; postMessage: (m: Reply) => void }
  g.self = globalThis
  g.postMessage = (m) => { replies.push(m) }
  await import('./validator.worker')
})

const HEAD = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('t.ifc','2026-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`
const TAIL = `ENDSEC;
END-ISO-10303-21;`

// Two psets carry the same empty property: one on walls #12 and #11, one on #10.
const LINES = {
  project: `#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,$);`,
  walls: [
    `#10=IFCWALL('1aaaaaaaaaaaaaaaaaaaaa',$,'W10',$,$,$,$,$,$);`,
    `#11=IFCWALL('1bbbbbbbbbbbbbbbbbbbbb',$,'W11',$,$,$,$,$,$);`,
    `#12=IFCWALL('1ccccccccccccccccccccc',$,'W12',$,$,$,$,$,$);`,
  ],
  prop: `#20=IFCPROPERTYSINGLEVALUE('Reference',$,$,$);`,
  psetA: `#21=IFCPROPERTYSET('2aaaaaaaaaaaaaaaaaaaaa',$,'Pset_WallCommon',$,(#20));`,
  psetB: `#22=IFCPROPERTYSET('2bbbbbbbbbbbbbbbbbbbbb',$,'Pset_WallCommon',$,(#20));`,
  relA: `#30=IFCRELDEFINESBYPROPERTIES('3aaaaaaaaaaaaaaaaaaaaa',$,$,$,(#12,#11),#21);`,
  relB: `#31=IFCRELDEFINESBYPROPERTIES('3bbbbbbbbbbbbbbbbbbbbb',$,$,$,(#10),#22);`,
}

function file(order: 'as-written' | 'reordered'): ArrayBuffer {
  const { project, walls, prop, psetA, psetB, relA, relB } = LINES
  const data = order === 'as-written'
    ? [project, ...walls, prop, psetA, psetB, relA, relB]
    : [project, ...walls, prop, psetB, psetA, relB, relA]
  return new TextEncoder().encode([HEAD, ...data, TAIL].join('\n')).buffer as ArrayBuffer
}

async function emptyPropertyIssues(id: string, buffer: ArrayBuffer): Promise<ValidationIssue[]> {
  const handler = (globalThis as unknown as { onmessage: (e: { data: unknown }) => void }).onmessage
  handler({ data: { type: 'validate', id, buffer, rules: DEFAULT_RULES, skipTree: true } })
  for (let i = 0; i < 300; i++) {
    const r = replies.find((m) => m.id === id && (m.type === 'done' || m.type === 'error'))
    if (r?.type === 'error') throw new Error(r.message)
    if (r?.result) return r.result.issues.filter((x) => x.ruleId === 'RULE_EMPTY_PROPERTY_VALUE')
    await new Promise((res) => setTimeout(res, 20))
  }
  throw new Error(`no reply for ${id}`)
}

describe('RULE_EMPTY_PROPERTY_VALUE — the grouped issue does not depend on line order', () => {
  it('names the issue after the lowest express id, however the file lists its lines', async () => {
    const a = await emptyPropertyIssues('as-written', file('as-written'))
    const b = await emptyPropertyIssues('reordered', file('reordered'))

    expect(a).toHaveLength(1)
    expect(a[0].elementName).toBe('(3 elements)')
    expect(a[0].expressId).toBe(10)
    expect(a[0].globalId).toBe('1aaaaaaaaaaaaaaaaaaaaa')
    expect(b.map((i) => [i.expressId, i.globalId, i.message]))
      .toEqual(a.map((i) => [i.expressId, i.globalId, i.message]))
  }, 60000)
})
