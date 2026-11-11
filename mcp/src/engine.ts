// ─── engine.ts ────────────────────────────────────────────────────────────────
// Runs the viewer's own validator and IDS workers inside Node, so the server
// gives the same issues, Health Score and IDS verdict as the browser app.
//
// Both workers are plain modules that install `self.onmessage` and answer with
// `self.postMessage`. Here `self` is globalThis: each worker is imported in turn
// and its handler captured before the next one replaces it, and every reply is
// routed back to the call that sent it by the message id.

import { DOMParser } from '@xmldom/xmldom'
import { DEFAULT_RULES } from '../../src/types'
import type { RulesConfig, ValidationResult } from '../../src/types'
import { calculateQualityScore, explainQualityScore } from '../../src/lib/quality-score'
import { parseIds } from '../../src/lib/ids/ids-parser'
import type { IdsDocument, IdsResult } from '../../src/lib/ids/ids-types'

type Handler = (e: { data: unknown }) => void
type Reply = { type: string; id?: string; [k: string]: unknown }

const g = globalThis as unknown as {
  self: unknown
  onmessage: Handler | null
  postMessage: (m: Reply) => void
  DOMParser?: unknown
}

const waiting = new Map<string, (m: Reply) => void>()
let handlers: Promise<{ validator: Handler; ids: Handler }> | null = null

function install(): Promise<{ validator: Handler; ids: Handler }> {
  if (handlers) return handlers
  g.self = globalThis
  g.postMessage = (m) => { if (m.id) waiting.get(m.id)?.(m) }
  // The IDS parser reads XML with DOMParser, which Node does not have.
  if (!g.DOMParser) g.DOMParser = DOMParser
  handlers = (async () => {
    await import('../../src/workers/validator.worker')
    const validator = g.onmessage!
    await import('../../src/workers/ids.worker')
    const ids = g.onmessage!
    return { validator, ids }
  })()
  return handlers
}

let seq = 0

/** Send one message and wait for the reply that ends it (`done`/`result`/`error`). */
async function call(pick: 'validator' | 'ids', msg: Record<string, unknown>, ends: string[], timeoutMs: number): Promise<Reply> {
  const h = (await install())[pick]
  const id = `mcp-${++seq}`
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`No answer after ${timeoutMs / 1000} s — the file may be too large or corrupt.`)) }, timeoutMs)
    waiting.set(id, (m) => {
      if (!ends.includes(m.type)) return
      clearTimeout(timer)
      waiting.delete(id)
      if (m.type === 'error') reject(new Error(String(m.message ?? 'The check failed.')))
      else resolve(m)
    })
    h({ data: { ...msg, id } })
  })
}

export interface ValidationReport {
  healthScore: number
  result: ValidationResult
  /** The rules that cost the most points, worst first. */
  scoreBreakdown: ReturnType<typeof explainQualityScore>
}

/** Validate IFC bytes with the viewer's rule set and score them. */
export async function validateIfc(bytes: Uint8Array, rules: RulesConfig = DEFAULT_RULES): Promise<ValidationReport> {
  const buffer = toArrayBuffer(bytes)
  const reply = await call('validator', { type: 'validate', buffer, rules, skipTree: true }, ['done', 'error'], 300_000)
  const result = reply.result as ValidationResult
  return { healthScore: calculateQualityScore(result), result, scoreBreakdown: explainQualityScore(result) }
}

/** Check IFC bytes against an IDS file (XML text). */
export async function checkIds(bytes: Uint8Array, idsXml: string): Promise<{ doc: IdsDocument; result: IdsResult }> {
  await install()
  const doc = parseIds(idsXml)
  const buffer = toArrayBuffer(bytes)
  const reply = await call('ids', { type: 'check-ids', buffer, doc }, ['result', 'error'], 300_000)
  return { doc, result: reply.result as IdsResult }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
