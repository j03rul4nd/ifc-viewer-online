// ─── Local validation runner ─────────────────────────────────────────────────
// Claims validation jobs from a LOCAL ifc-cloud-api (wrangler dev), downloads
// the delivered IFC from the local S3 stand-in, validates it with the viewer's
// own engine (the same workers the browser runs, via mcp/src/engine.ts),
// checks the IDS if the requirement set is one, and posts the result.
//
//   npm run runner:local            (keeps polling)
//   npm run runner:local -- --once  (one job, then exit — used by the tests)
//
// Env: IFC_API_URL (default http://127.0.0.1:8787), RUNNER_TOKEN (≥ 32 chars,
// same as the API's .dev.vars). Refuses any API that is not on localhost.

import { createHash } from 'node:crypto'
import { validateIfc, checkIds } from '../../mcp/src/engine'
import { looksLikeIfc, summarize } from './summarize'

const API = (process.env.IFC_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const TOKEN = process.env.RUNNER_TOKEN ?? ''
const ONCE = process.argv.includes('--once')
const ENGINE = 'ifc-viewer-web-ifc-local'

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) { console.error(`Refusing: ${API} is not a local API.`); process.exit(1) }
if (TOKEN.length < 32) { console.error('RUNNER_TOKEN (≥ 32 characters) is required.'); process.exit(1) }

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
      const report = await validateIfc(bytes)
      let failedSpecs = 0
      if (claim.requirements.trimStart().startsWith('<')) {
        const ids = await checkIds(bytes, claim.requirements)
        failedSpecs = ids.result.failedSpecs
      }
      body = summarize(report.result, report.healthScore, failedSpecs, ENGINE)
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
  console.log(`Runner polling ${API}`)
  for (;;) {
    const did = await runOnce().catch((e) => { console.error((e as Error).message); return false })
    if (!did) await new Promise((r) => setTimeout(r, 2000))
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
