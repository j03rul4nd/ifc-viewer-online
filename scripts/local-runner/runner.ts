// ─── Local validation runner ─────────────────────────────────────────────────
// Claims validation jobs from a LOCAL ifc-cloud-api (wrangler dev), downloads
// the delivered IFC from the local S3 stand-in, validates it with the viewer's
// own engine (the same workers the browser runs, via mcp/src/engine.ts),
// checks the IDS if the requirement set is one, and posts the result.
//
//   npm run runner:local            (keeps polling)
//   npm run runner:local -- --once  (one job, then exit)
//   npm run runner:local -- --drain (every queued job, then exit — used by the tests)
//   node …/runner.mjs --validate <file.ifc>  (prints the engine's result as JSON; no API)
//
// Env: IFC_API_URL (default http://127.0.0.1:8787), RUNNER_TOKEN (≥ 32 chars,
// same as the API's .dev.vars). Refuses any API that is not on localhost.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { validateIfc, checkIds, DamagedIfcError } from '../../mcp/src/engine'
import { looksLikeIfc, summarize } from './summarize'

const API = (process.env.IFC_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const TOKEN = process.env.RUNNER_TOKEN ?? ''
const ONCE = process.argv.includes('--once')
/** Every queued job, then exit (tests: never leaves an older job for the next run). */
const DRAIN = process.argv.includes('--drain')
const ENGINE = 'ifc-viewer-web-ifc-local'

const VALIDATE = process.argv.indexOf('--validate')
if (VALIDATE > 0) {
  const bytes = new Uint8Array(readFileSync(process.argv[VALIDATE + 1]))
  validateIfc(bytes).then((r) => {
    process.stdout.write(JSON.stringify({ healthScore: r.healthScore, issues: r.result.issues, stats: r.result.stats, fileHash: createHash('sha256').update(bytes).digest('hex') }))
    process.exit(0)
  }, (e) => {
    if (e instanceof DamagedIfcError) { process.stdout.write(JSON.stringify({ damaged: e.integrity })); process.exit(0) }
    console.error(e); process.exit(1)
  })
} else if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) { console.error(`Refusing: ${API} is not a local API.`); process.exit(1) }
if (VALIDATE < 0 && TOKEN.length < 32) { console.error('RUNNER_TOKEN (≥ 32 characters) is required.'); process.exit(1) }

const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

interface Claim { job: { id: string; file_hash: string; size_bytes: number; min_score: number }; file_url: string; requirements: string }

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) })
}

/** Runs one job. Returns false when there was nothing to do. */
export async function runOnce(): Promise<boolean> {
  const res = await post('/internal/jobs/claim', {})
  if (res.status === 204) return false
  if (!res.ok) throw new Error(`claim failed: ${res.status} ${await res.text()}`)
  const claim = (await res.json()) as Claim
  const { job } = claim
  const t0 = Date.now()
  let body: unknown
  try {
    const file = await fetch(claim.file_url)
    if (!file.ok) throw new Error(`download failed: ${file.status}`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const hash = createHash('sha256').update(bytes).digest('hex')
    const bad = hash !== job.file_hash ? 'the file differs from the one declared (SHA-256 mismatch)' : looksLikeIfc(bytes)
    if (bad) {
      body = { outcome: 'invalid_file', reason: bad }
    } else {
      // A file the engine cannot read is the supplier's problem, not a reason to retry forever.
      try {
        const report = await validateIfc(bytes)
        let failedSpecs = 0
        if (claim.requirements.trimStart().startsWith('<')) {
          const ids = await checkIds(bytes, claim.requirements)
          failedSpecs = ids.result.failedSpecs
        }
        body = summarize(report.result, report.healthScore, failedSpecs, ENGINE)
      } catch (e) {
        body = e instanceof DamagedIfcError
          ? { outcome: 'damaged', code: e.integrity.code, reason: e.integrity.reason.slice(0, 300) }
          : { outcome: 'invalid_file', reason: `the validator could not read it: ${(e as Error).message}`.slice(0, 300) }
      }
    }
  } catch (e) {
    // Network or engine failure: leave the job to its lease so it is retried.
    console.error(`job ${job.id}: ${(e as Error).message}`)
    return true
  }
  const out = await post(`/internal/jobs/${job.id}/result`, body)
  console.log(`job ${job.id}: ${out.status} in ${((Date.now() - t0) / 1000).toFixed(1)} s ${JSON.stringify(body).slice(0, 160)}`)
  return true
}

async function main() {
  if (ONCE) { await runOnce(); return }
  if (DRAIN) { while (await runOnce()) { /* next job */ } return }
  console.log(`Runner polling ${API}`)
  for (;;) {
    const did = await runOnce().catch((e) => { console.error((e as Error).message); return false })
    if (!did) await new Promise((r) => setTimeout(r, 2000))
  }
}

if (VALIDATE < 0) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
