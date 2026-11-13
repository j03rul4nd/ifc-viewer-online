// @vitest-environment node
// ─── Simulated pilot at scale, on the LOCAL backend ──────────────────────────
// 50 deliveries from a watched folder (real Port de Barcelona library files, a
// few damaged and a few misnamed) handled 4 at a time with 3 runners, plus the
// 94 MB Shanghai Tower through the upload page — measured, with the machine's
// CPU load sampled during the run. Results go to PILOT_OUT (JSON) for doc 32.
// Runs only with PAID_LOCAL_API and PAID_LOCAL_PILOT_SCALE=1.

import { describe, expect, it, vi } from 'vitest'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { resolve } from 'node:path'
import { deliverFile, paidApi, type ApiDelivery } from './paid-client'
import { receptionValidator } from './watch-reception'
import { pollFolder } from '../connectors/watch'
import type { Connector, RemoteFile, WatchedFolder } from '../connectors/types'

const API = process.env.PAID_LOCAL_API ?? ''
const ON = Boolean(API) && process.env.PAID_LOCAL_PILOT_SCALE === '1'
const ORG = 'org_localpilot'
const RUNNERS = Number(process.env.PILOT_RUNNERS ?? 3)
const CONCURRENCY = Number(process.env.PILOT_CONCURRENCY ?? 4)
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
const TOWER = resolve('public/models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc')

/** Machine CPU load (%) sampled every 5 s by PowerShell (Windows) — the honest context for every time below. */
function sampleLoad(): { stop: () => number[] } {
  const samples: number[] = []
  const t = setInterval(() => {
    try {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'], { timeout: 10_000 }).toString().trim()
      const n = Number(out.replace(',', '.')); if (Number.isFinite(n)) samples.push(n)
    } catch { /* sampling is best effort */ }
  }, 5000)
  return { stop: () => { clearInterval(t); return samples } }
}
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0 }
const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe.skipIf(!ON)('simulated pilot at scale (local backend)', { timeout: 3_600_000 }, () => {
  it('50 deliveries from a watched folder + the Shanghai Tower from the upload page', async () => {
    vi.stubEnv('VITE_API_URL', API)
    vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_pilotowner:${ORG}`)
    const out: Record<string, unknown> = { run, machine: { cpu: cpus()[0]?.model, threads: cpus().length, ram_gb: Math.round(totalmem() / 1e9) }, runners: RUNNERS, folder_concurrency: CONCURRENCY }
    const load = sampleLoad()

    const set = await paidApi.createRequirementSet(`Obra escala ${run}`, 70, JSON.stringify({ project: `ESC${run}`.slice(0, 6), client: 'Promotora Piloto' }))
    if (!set.ok) throw new Error(set.error.code)
    const project = `ESC${run}`.slice(0, 6)
    const sup = await paidApi.createSupplier(`Urbanizacion ${run}`, 'URB')
    const page = await paidApi.createSupplier(`Torre ${run}`, 'ARQ')
    if (!sup.ok || !page.ok) throw new Error('suppliers')
    const org = (n: string) => n.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()
    const iso = (who: string, n: number) => `${project}-${org(who)}-ZZ-XX-M3-L-${String(n).padStart(4, '0')}-S2-P01.ifc`

    // 50 real files: 44 good, 3 cut short (damaged), 3 misnamed (refused by the server).
    const dir = resolve('public/models/port-bcn')
    const pool = readdirSync(dir).filter((f) => f.endsWith('.ifc')).map((f) => resolve(dir, f)).sort((a, b) => statSync(a).size - statSync(b).size).slice(-60)
    const files: { name: string; bytes: Buffer; kind: 'good' | 'damaged' | 'misnamed' }[] = []
    for (let i = 0; i < 50; i++) {
      const raw = Buffer.concat([readFileSync(pool[i % pool.length]), Buffer.from(`\n/* ${run}-${i} */\n`)])
      const kind = i % 17 === 5 ? 'damaged' : i % 17 === 11 ? 'misnamed' : 'good'
      files.push({ name: kind === 'misnamed' ? `farola ${i} final.ifc` : iso(`Urbanizacion ${run}`, i + 1), bytes: kind === 'damaged' ? raw.subarray(0, Math.floor(raw.byteLength * 0.6)) : raw, kind })
    }
    out.folder_mb = Math.round(files.reduce((s, f) => s + f.bytes.byteLength, 0) / 1e5) / 10

    const runners: ChildProcess[] = Array.from({ length: RUNNERS }, () => spawn(process.execPath, ['scripts/local-runner/dist/runner.mjs'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'ignore' }))
    try {
      // The tower first, as a person would on the upload page, while the folder fills behind it.
      const towerBytes = readFileSync(TOWER)
      const t0 = performance.now()
      const tower = await deliverFile(page.value.token, set.value.requirement_set.slug, `${project}-${org(`Torre ${run}`)}-ZZ-XX-M3-A-0001-S2-P01.ifc`, buf(towerBytes), 'page')
      if (!tower.ok) throw new Error(`tower ${tower.error.code}`)
      const towerUploaded = performance.now() - t0

      const remote: RemoteFile[] = files.map((f, i) => ({ id: `e-${run}-${i}`, name: f.name, size: f.bytes.byteLength, version: '1', modifiedAt: new Date().toISOString(), parentId: 'root' }))
      const connector: Connector = {
        id: 'sharepoint', name: 'Carpeta escala', oauth: { authorizeUrl: '', tokenUrl: '', scopes: [] } as unknown as Connector['oauth'],
        startCursor: async () => 'c0', changes: async (_f, c) => ({ files: c === 'c0' ? remote : [], cursor: 'c1' }),
        download: async (f) => buf(files[remote.findIndex((r) => r.id === f.id)].bytes),
        upload: async () => 'res',
      }
      const folder = { connector: 'sharepoint', folderId: 'root', folderName: 'Entregas', state: 'watching', seen: [], failures: 0 } as unknown as WatchedFolder
      const t1 = performance.now()
      const polled = await pollFolder(connector, folder, 'token', receptionValidator({ supplierToken: sup.value.token, requirementSlug: set.value.requirement_set.slug }, { intervalMs: 1500, timeoutMs: 900_000 }), undefined, CONCURRENCY)
      const folderMs = performance.now() - t1

      // Wait for the tower's verdict too.
      let towerRow: ApiDelivery | undefined
      for (const start = Date.now(); Date.now() - start < 1_200_000; await new Promise((r) => setTimeout(r, 3000))) {
        const l = await paidApi.deliveries({ requirementSet: set.value.requirement_set.id, limit: 200 })
        towerRow = l.ok ? l.value.deliveries.find((d) => d.id === tower.value.deliveryId) : undefined
        if (towerRow && towerRow.file_status !== 'pending') break
      }
      const towerTotal = performance.now() - t0

      const list = await paidApi.deliveries({ requirementSet: set.value.requirement_set.id, limit: 200 })
      const rows = list.ok ? list.value.deliveries : []
      const byStatus = (s: string) => rows.filter((d) => d.file_status === s).length
      out.folder = {
        files: files.length, wall_s: Math.round(folderMs / 100) / 10, per_file_s: Math.round(folderMs / files.length / 100) / 10,
        validated: polled.results.filter((r) => r.status === 'validated').length,
        refused_naming: polled.results.filter((r) => r.status === 'failed' && /naming/.test(r.error ?? '')).length,
        failed_other: polled.results.filter((r) => r.status === 'failed' && !/naming/.test(r.error ?? '')).map((r) => r.error).slice(0, 5),
        ok: byStatus('ok') - (towerRow?.file_status === 'ok' ? 1 : 0), damaged: byStatus('damaged'),
        accepted: rows.filter((d) => d.auto?.verdict === 'accepted').length, rejected: rows.filter((d) => d.auto?.verdict === 'rejected').length,
      }
      out.tower = { mb: Math.round(towerBytes.byteLength / 1e5) / 10, upload_s: Math.round(towerUploaded / 100) / 10, verdict_s: Math.round(towerTotal / 100) / 10, file_status: towerRow?.file_status, score: towerRow?.score, verdict: towerRow?.auto?.verdict }
      // Damaged files come back with a verdict (rejected, file_status damaged), so they count as handled.
      expect(out.folder).toMatchObject({ validated: 47, refused_naming: 3, damaged: 3 })
      expect(towerRow?.file_status).toBe('ok')
    } finally {
      for (const r of runners) r.kill()
      const s = load.stop()
      out.cpu_load = { samples: s.length, median: pct(s, 0.5), p90: pct(s, 0.9), max: Math.max(0, ...s) }
      writeFileSync(process.env.PILOT_OUT ?? 'pilot-scale.json', JSON.stringify(out, null, 2))
    }
  })
})
