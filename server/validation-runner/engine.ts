// ─── Validation engine for Node ───────────────────────────────────────────────
// Runs the browser's own validator and IDS workers in Node, unchanged, so the
// score a receiver sees from the server is the score the supplier saw in the
// browser. Each worker module is loaded once behind a `self` shim: its
// self.onmessage is called directly and its postMessage is captured.
//
// Bundled by build.mjs (esbuild): `import.meta.env` is defined at build time and
// `web-ifc` resolves to its Node build.

import { JSDOM } from 'jsdom'
import { DEFAULT_RULES, type RulesConfig, type ValidationResult } from '../../src/types'
import { calculateQualityScore } from '../../src/lib/quality-score'
import { parseIds } from '../../src/lib/ids/ids-parser'
import type { IdsDocument } from '../../src/lib/ids/ids-types'

type Handler = (e: { data: unknown }) => void
type Listener = (msg: Record<string, unknown>) => void

let listener: Listener | null = null
const shim = {
  onmessage: null as Handler | null,
  postMessage: (msg: Record<string, unknown>) => listener?.(msg),
  addEventListener() {}, removeEventListener() {},
}

/** Imports a worker module with its own `self`, returning its onmessage. */
async function loadWorker(load: () => Promise<unknown>): Promise<Handler> {
  ;(globalThis as Record<string, unknown>).self = shim
  shim.onmessage = null
  await load()
  const h = shim.onmessage
  if (!h) throw new Error('worker did not register onmessage')
  return h
}

let validatorHandler: Handler | null = null
let idsHandler: Handler | null = null

/** Sends one request and resolves with the first terminal message. Workers run one job at a time here. */
function call(handler: Handler, request: Record<string, unknown>, terminal: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    listener = (msg) => { if (terminal.includes(String(msg.type))) { listener = null; resolve(msg) } }
    handler({ data: request })
  })
}

export interface FailedRule {
  rule_id: string
  count: number
  /** Worst severity seen for the rule. */
  severity: 'error' | 'warning' | 'info'
  /** Up to 200 GlobalIds of affected elements. */
  guids: string[]
}

const RANK = { info: 0, warning: 1, error: 2 } as const

/** Groups issues per rule for the API's auto-issues (T6). Pure. */
export function summarizeRules(issues: ValidationResult['issues']): FailedRule[] {
  const by = new Map<string, FailedRule>()
  for (const i of issues) {
    let r = by.get(i.ruleId)
    if (!r) by.set(i.ruleId, (r = { rule_id: i.ruleId, count: 0, severity: i.severity, guids: [] }))
    r.count++
    if (RANK[i.severity] > RANK[r.severity]) r.severity = i.severity
    if (i.globalId && r.guids.length < 200 && !r.guids.includes(i.globalId)) r.guids.push(i.globalId)
  }
  return [...by.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.count - a.count)
}

export interface EngineResult {
  rules: FailedRule[]
  score: number
  issues: number
  errors: number
  unreadableEntities: number
  durationMs: number
}

export async function validateIfc(bytes: Uint8Array, rules: RulesConfig = DEFAULT_RULES): Promise<EngineResult> {
  validatorHandler ??= await loadWorker(() => import('../../src/workers/validator.worker'))
  const started = Date.now()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const msg = await call(validatorHandler, { type: 'validate', id: 'srv', buffer, rules, skipTree: true }, ['done', 'error'])
  if (msg.type === 'error') throw new Error(String(msg.message))
  const result = msg.result as ValidationResult & { unreadableEntities?: number }
  return {
    rules: summarizeRules(result.issues),
    score: calculateQualityScore(result),
    issues: result.issues.length,
    errors: result.issues.filter((i) => i.severity === 'error').length,
    unreadableEntities: result.unreadableEntities ?? 0,
    durationMs: Date.now() - started,
  }
}

/** Parses IDS XML with a server-side DOMParser (the browser parser needs one). */
export function parseIdsXml(xml: string): IdsDocument {
  const g = globalThis as Record<string, unknown>
  if (typeof g.DOMParser === 'undefined') g.DOMParser = new JSDOM('').window.DOMParser
  return parseIds(xml)
}

export async function checkIds(bytes: Uint8Array, doc: IdsDocument): Promise<{ failedSpecs: number; totalSpecs: number }> {
  idsHandler ??= await loadWorker(() => import('../../src/workers/ids.worker'))
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const msg = await call(idsHandler, { type: 'check-ids', id: 'srv', buffer, doc }, ['result', 'error'])
  if (msg.type === 'error') throw new Error(`${msg.code}: ${msg.message}`)
  const r = msg.result as { failedSpecs: number; totalSpecs: number }
  return { failedSpecs: r.failedSpecs, totalSpecs: r.totalSpecs }
}
