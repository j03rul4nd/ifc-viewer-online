// ─── Validation runner ────────────────────────────────────────────────────────
// Stateless worker for server-side validation (Reception R2, Pro P1). It holds
// no database credentials: it claims a job from the API, downloads the file
// from a presigned URL, checks its SHA-256, validates it with the browser's own
// engine and posts the outcome back. Built to run anywhere and scale to zero:
// Cloudflare Containers, a VM that sleeps when idle, or a spare PC.
//
//   API_URL=https://api.example  RUNNER_TOKEN=…  node dist-runner/runner.mjs [--once]
//
// Exit codes: 0 done (--once) · 1 configuration error.

import { createHash } from 'node:crypto'
import { checkIds, parseIdsXml, validateIfc } from './engine'

export const ENGINE = 'ifcvo-browser-engine/1'
const IDLE_MS = 15_000
const MAX_BYTES = 3 * 1024 ** 3

interface Claim {
  job: { id: string; attempt: number; file_hash: string; size_bytes: number; min_score: number }
  file_url: string
  requirements: string
}

type Outcome =
  | { outcome: 'validated'; score: number; failed_specs: number; issues: number; errors: number; engine: string }
  | { outcome: 'invalid_file'; reason: string }

/** STEP files start with this; anything else is not an IFC we can read. */
export function looksLikeIfc(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart()
  return head.startsWith('ISO-10303-21')
}

export function isIdsXml(text: string): boolean {
  return /<(\w+:)?ids[\s>]/.test(text.slice(0, 2000))
}

/** Decides the outcome for one file. Pure apart from the engine, so it is tested with real IFC bytes. */
export async function evaluate(bytes: Uint8Array, expectedHash: string, requirements: string): Promise<Outcome> {
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== expectedHash) return { outcome: 'invalid_file', reason: 'the file does not match the declared SHA-256' }
  if (!looksLikeIfc(bytes)) return { outcome: 'invalid_file', reason: 'not an IFC (STEP) file' }
  let v
  try {
    v = await validateIfc(bytes)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    // A model web-ifc cannot open is the supplier's to fix; anything else is ours (retry).
    if (/could not open the model|unsupported schema/i.test(m)) return { outcome: 'invalid_file', reason: m.slice(0, 280) }
    throw e
  }
  let failedSpecs = 0
  if (isIdsXml(requirements)) failedSpecs = (await checkIds(bytes, parseIdsXml(requirements))).failedSpecs
  return { outcome: 'validated', score: v.score, failed_specs: failedSpecs, issues: v.issues, errors: v.errors, engine: ENGINE }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${process.env.API_URL!.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RUNNER_TOKEN}`, 'Content-Type': 'application/json', ...init.headers },
  })
}

/** One claim → evaluate → report cycle. Returns false when there was nothing to do. */
export async function runOnce(log = console.log): Promise<boolean> {
  const res = await api('/internal/jobs/claim', { method: 'POST' })
  if (res.status === 204) return false
  if (!res.ok) throw new Error(`claim failed: HTTP ${res.status}`)
  const claim = (await res.json()) as Claim
  const { job } = claim
  log(`job ${job.id} attempt ${job.attempt}: ${(job.size_bytes / 1024 / 1024).toFixed(1)} MB`)
  if (job.size_bytes > MAX_BYTES) {
    await report(job.id, { outcome: 'invalid_file', reason: 'larger than the 3 GB server limit' })
    return true
  }
  const file = await fetch(claim.file_url)
  if (!file.ok) throw new Error(`download failed: HTTP ${file.status}`) // lease expires → retried
  const bytes = new Uint8Array(await file.arrayBuffer())
  const outcome = await evaluate(bytes, job.file_hash, claim.requirements)
  await report(job.id, outcome)
  log(`job ${job.id}: ${outcome.outcome === 'validated' ? `score ${outcome.score}, ${outcome.failed_specs} failed specs` : outcome.reason}`)
  return true
}

async function report(id: string, outcome: Outcome): Promise<void> {
  const r = await api(`/internal/jobs/${id}/result`, { method: 'POST', body: JSON.stringify(outcome) })
  if (!r.ok) throw new Error(`result failed: HTTP ${r.status}`)
}

async function main(): Promise<void> {
  if (!process.env.API_URL || !process.env.RUNNER_TOKEN) {
    console.error('API_URL and RUNNER_TOKEN are required')
    process.exit(1)
  }
  const once = process.argv.includes('--once')
  for (;;) {
    let worked = false
    try { worked = await runOnce() } catch (e) { console.error(e instanceof Error ? e.message : e) }
    if (once) return
    if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS))
  }
}

if (process.argv[1] && /runner\.(mjs|ts|js)$/.test(process.argv[1])) void main()
