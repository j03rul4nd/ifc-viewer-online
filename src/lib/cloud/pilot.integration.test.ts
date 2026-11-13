// @vitest-environment node
// ─── Simulated pilot, end to end, on the LOCAL backend ───────────────────────
// A fictional contractor (org_localpilot) opens a site, invites 5 suppliers; they
// deliver good and bad versions of real public IFC files (Port de Barcelona
// library + the project's own sample buildings) through the upload page's own
// calls and through a watched folder; the contractor reviews, accepts, rejects,
// raises and resolves issues, shares clash statuses and the mail queue fills.
// Every step is timed; the timings go to PILOT_OUT (JSON) for docs-planning/32.
// Runs only with PAID_LOCAL_API and PAID_LOCAL_PILOT=1 (see docs/PAID_LOCAL.md).

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { deliverFile, paidApi, supplierHome, type ApiDelivery } from './paid-client'
import { receptionValidator } from './watch-reception'
import { pollFolder } from '../connectors/watch'
import type { Connector, RemoteFile, ResultUpload, WatchedFolder } from '../connectors/types'
import { originatorOf, supplierProjectFromApi } from '../../components/workspace/sections/reception/live'
import { namingOf } from '../../components/workspace/sections/reception/sample'

const API = process.env.PAID_LOCAL_API ?? ''
const ON = Boolean(API) && process.env.PAID_LOCAL_PILOT === '1'
const ORG = 'org_localpilot'
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
const as = (who: 'owner' | 'coord' | 'reviewer') => vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_pilot${who}:${ORG}`)

type Step = { step: string; ms: number; note?: string }
const steps: Step[] = []
const frictions: string[] = []
async function timed<T>(step: string, fn: () => Promise<T>, note?: (v: T) => string): Promise<T> {
  const t = performance.now()
  const v = await fn()
  steps.push({ step, ms: Math.round(performance.now() - t), ...(note ? { note: note(v) } : {}) })
  return v
}
function drain(step: string) {
  const t = performance.now()
  execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--drain'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'pipe', timeout: 600_000 })
  steps.push({ step, ms: Math.round(performance.now() - t) })
}
/** The upload page's in-browser check, run with the same engine (runner --validate) outside a browser. */
function engineCheck(bytes: ArrayBuffer): { score?: number; error?: string } {
  const dir = mkdtempSync(resolve(tmpdir(), 'pilot-'))
  try {
    const f = resolve(dir, 'm.ifc'); writeFileSync(f, Buffer.from(bytes))
    const out = execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--validate', f], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, maxBuffer: 256 * 1024 * 1024 }).toString()
    return { score: (JSON.parse(out) as { healthScore: number }).healthScore }
  } catch (e) { return { error: (e as Error).message.split(/\r?\n/)[0].slice(0, 120) } } finally { rmSync(dir, { recursive: true, force: true }) }
}
const bytesOf = (p: string, salt = '') => {
  const b = Buffer.concat([readFileSync(resolve(p)), Buffer.from(salt ? `\n/* ${salt} */\n` : '')])
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

const M = 'public/models/'
const SUPPLIERS = [
  { name: 'Arquitectura Vela', disc: 'ARQ', role: 'A', good: `${M}hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc` },
  { name: 'Estructuras Vela', disc: 'EST', role: 'S', good: `${M}hotel-vela/BCN-IVO-ZZ-XX-M3-S-0002.ifc` },
  { name: 'Instalaciones Poblenou', disc: 'MEP', role: 'M', good: `${M}torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc` },
  { name: 'Urbanizacion Port', disc: 'URB', role: 'L', good: `${M}port-bcn/APBCN-URB-CER-Cerramiento_Vallado_Obra.ifc` },
  { name: 'Civil Movilidad', disc: 'CIV', role: 'C', good: `${M}barcelona-catalunya/catalunya-mobility-hub.ifc` },
] as const

describe.skipIf(!ON)('simulated pilot (local backend)', { timeout: 900_000 }, () => {
  let slug = ''
  const tokens: Record<string, string> = {}
  const project = () => `PIL${run}`.slice(0, 6)
  const iso = (supplier: string, role: string, n: number, rev = 'P01') => `${project()}-${originatorOf(supplier)}-ZZ-XX-M3-${role}-${String(n).padStart(4, '0')}-S2-${rev}.ifc`

  beforeAll(() => { vi.stubEnv('VITE_API_URL', API); as('owner') })

  it('1. the contractor opens the site and invites 5 suppliers', async () => {
    const set = await timed('Crear la obra (requisitos, nota mínima 70)', () => paidApi.createRequirementSet(`Obra piloto ${run}`, 70, JSON.stringify({ project: project(), due_day: 5, due_hour: 12, client: 'Promotora Piloto' })))
    if (!set.ok) throw new Error(set.error.code)
    slug = set.value.requirement_set.slug
    for (const s of SUPPLIERS) {
      const r = await timed(`Invitar proveedor ${s.disc}`, () => paidApi.createSupplier(`${s.name} ${run}`, s.disc))
      if (!r.ok) throw new Error(r.error.code)
      tokens[s.disc] = r.value.token
      const c = await paidApi.saveContact({ email: `${s.disc.toLowerCase()}-${run.toLowerCase()}@example.com`, name: s.name, lang: 'es', consent_source: 'pilot: supplier contract' })
      expect(c.ok).toBe(true)
    }
    // The contractor's automation: anything under the bar mails the coordinator (queued, never sent).
    const au = await timed('Crear automatización (nota < 70 → correo al coordinador)', () => paidApi.createAutomation({ name: `Piloto aviso ${run}`, enabled: true, trigger: 'delivery.validated', conditions: { score_below: 70 }, actions: [{ type: 'queue_mail', to: `coord-${run.toLowerCase()}@example.com`, subject: 'Entrega {{name}} con nota {{score}}', body: 'Revisa la entrega {{name}}: nota {{score}}.' }], minutes_saved: 10 }))
    expect(au.ok).toBe(true)
  })

  it('2. suppliers deliver through the upload page: check in the browser engine, then deliver', async () => {
    for (const s of SUPPLIERS.filter((x) => x.disc !== 'URB')) {
      const token = tokens[s.disc]
      const home = await timed(`Página de subida: cargar (${s.disc})`, () => supplierHome(token, slug))
      if (!home.ok) throw new Error(home.error.code)
      const p = supplierProjectFromApi(home.value.projects[0], home.value.supplier.name)
      const bytes = bytesOf(s.good, `${run}-${s.disc}-v1`)
      // ARQ's first try is misnamed (a real-life classic): the page catches it, the supplier renames.
      const firstName = s.disc === 'ARQ' ? `Hotel Vela arquitectura final v2.ifc` : iso(s.name, s.role, 1)
      const check = await timed(`Página de subida: comprobar en el navegador (${s.disc}, ${(bytes.byteLength / 1048576).toFixed(1)} MB)`, async () => {
        const v = engineCheck(bytes)
        return { v, naming: namingOf(p, { fileName: firstName }) }
      }, (r) => `nombre ${r.naming.ok ? 'ok' : 'MAL'}; ${r.v.error ? `motor: ${r.v.error}` : `nota ${r.v.score ?? '?'}`}`)
      const name = check.naming.ok ? firstName : iso(s.name, s.role, 1)
      if (!check.naming.ok) frictions.push(`${s.disc}: nombre «${firstName}» rechazado en la página; renombrado a mano a ${name}. El servidor lo habría aceptado igualmente.`)
      const d = await timed(`Entregar (${s.disc})`, () => deliverFile(token, slug, name, bytes))
      expect(d.ok).toBe(true)
    }
    // Bad versions from CIV: a PDF renamed .ifc, and a file cut in half by a failed upload.
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF')
    await timed('Entregar MALO: PDF renombrado (CIV)', () => deliverFile(tokens.CIV, slug, iso('Civil Movilidad', 'C', 2), pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer))
    const full = Buffer.from(bytesOf(SUPPLIERS[4].good, `${run}-cut`))
    const cut = full.subarray(0, Math.floor(full.byteLength * 0.6))
    await timed('Entregar MALO: IFC cortado al 60 % (CIV)', () => deliverFile(tokens.CIV, slug, iso('Civil Movilidad', 'C', 3), cut.buffer.slice(cut.byteOffset, cut.byteOffset + cut.byteLength) as ArrayBuffer))
    // EST sends the same file twice (double click): one delivery.
    const again = await timed('Reenvío del mismo fichero (EST)', () => deliverFile(tokens.EST, slug, iso('Estructuras Vela', 'S', 1), bytesOf(SUPPLIERS[1].good, `${run}-EST-v1`)))
    expect(again.ok && again.value.replayed).toBe(true)
    drain('Validación en servidor de 6 entregas (runner --drain)')
  })

  it('3. the urbanization supplier drops 6 files in a watched folder', async () => {
    const files = ['Cerramiento_Vallado_Obra', 'MOB-Farola_Baculo_Simple', 'MOB-Papelera_Cilindrica_Colgada_Doble', 'VIA-PaloSemaforo_Baculo_Curvo', 'MOB-Buzon_Correos_Amarillo', 'MOB-Maceta_Circular']
      .map((f, i) => ({ path: `${M}port-bcn/APBCN-URB-${f.startsWith('Cerr') ? 'CER-' : ''}${f}.ifc`, name: iso('Urbanizacion Port', 'L', i + 1) }))
    const remote: RemoteFile[] = files.map((f, i) => ({ id: `u-${run}-${i}`, name: f.name, size: 1, version: '1', modifiedAt: new Date().toISOString(), parentId: 'root' }))
    const written: ResultUpload[] = []
    const connector: Connector = {
      id: 'sharepoint', name: 'Carpeta piloto', oauth: { authorizeUrl: '', tokenUrl: '', scopes: [] } as unknown as Connector['oauth'],
      startCursor: async () => 'c0', changes: async (_f, cursor) => ({ files: cursor === 'c0' ? remote : [], cursor: 'c1' }),
      download: async (f) => bytesOf(files[remote.findIndex((r) => r.id === f.id)].path, `${run}-${f.id}`),
      upload: async (_f, r) => { written.push(r); return `res-${written.length}` },
    }
    const folder = { connector: 'sharepoint', folderId: 'root', folderName: 'Entregas URB', state: 'watching', seen: [], failures: 0 } as unknown as WatchedFolder
    // The runner works continuously in the background, as it would on a real site.
    const runner: ChildProcess = spawn(process.execPath, ['scripts/local-runner/dist/runner.mjs'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'ignore' })
    const polled = await timed('Carpeta vigilada: 6 IFC entregados y esperando veredicto', () => pollFolder(connector, folder, 'token', receptionValidator({ supplierToken: tokens.URB, requirementSlug: slug }, { intervalMs: 1000, timeoutMs: 240_000 })), (p) => `${p.results.filter((r) => r.status === 'validated').length}/6 validados; ${written.length} informes escritos junto al modelo`)
    runner.kill()
    if (polled.results.some((r) => r.status !== 'validated')) frictions.push(`Carpeta: ${polled.results.filter((r) => r.status !== 'validated').length} de 6 ficheros sin veredicto dentro del tiempo de espera (la carpeta espera uno a uno).`)
  })

  it('4. the contractor reviews: accept, reject with a reason, issues for the rejected ones', async () => {
    as('coord')
    const list = await timed('Bandeja de entregas: cargar', () => paidApi.deliveries())
    if (!list.ok) throw new Error(list.error.code)
    const all = list.value.deliveries.filter((d) => d.file_name.startsWith(project()))
    const waiting = all.filter((d) => d.score === null && d.verdict === 'pending' && !d.reason)
    if (waiting.length) frictions.push(`${waiting.length} entregas aún sin validar al abrir la bandeja; el servidor ya no deja aceptarlas hasta tener nota.`)
    // Only what the server already judged is reviewed now.
    const mine = all.filter((d) => !waiting.includes(d))
    steps.push({ step: 'Entregas en la bandeja', ms: 0, note: `${mine.length} (aceptadas auto ${mine.filter((d) => d.verdict === 'accepted').length}, rechazadas auto ${mine.filter((d) => d.verdict === 'rejected').length}, pendientes ${mine.filter((d) => d.verdict === 'pending').length})` })
    let accepted = 0, rejected = 0
    const issues: number[] = []
    for (const d of mine) {
      if (d.sealed_at) continue
      if (d.score !== null && d.score >= 70) {
        const r = await timed(`Decidir: aceptar ${d.file_name}`, () => paidApi.decide(d.id, 'accepted'))
        if (r.ok) accepted++
      } else {
        const reason = d.score === null ? 'El fichero no es un IFC válido; vuelve a exportarlo.' : `Nota ${d.score} por debajo de 70; corrige los fallos y reenvía.`
        const r = await timed(`Decidir: rechazar ${d.file_name}`, () => paidApi.decide(d.id, 'rejected', reason))
        if (r.ok) rejected++
        as('reviewer')
        const i = await timed(`Crear issue para ${d.file_name}`, () => paidApi.createIssue({ title: `Entrega rechazada: ${d.file_name}`, description: reason, priority: 'high', assignee_id: 'user_pilotcoord' }))
        as('coord')
        if (i.ok) issues.push(i.value.issue.number)
        const m = await timed(`Correo al proveedor (${d.supplier})`, () => paidApi.queueMail({ to: `${(SUPPLIERS.find((s) => d.supplier.startsWith(s.name))?.disc ?? 'xx').toLowerCase()}-${run.toLowerCase()}@example.com`, subject: `Entrega rechazada: ${d.file_name}`, body: reason, kind: 'delivery_rejected', ref_type: 'delivery', ref_id: d.id }, `pilot-${d.id}`))
        if (!m.ok) frictions.push(`Correo para ${d.file_name} rechazado: ${m.error.code}`)
      }
    }
    steps.push({ step: 'Decisiones', ms: 0, note: `${accepted} aceptadas, ${rejected} rechazadas, ${issues.length} issues` })
    // The fixed version arrives; the issue is resolved.
    if (issues.length) {
      const fix = await timed('Reenvío corregido (CIV P02)', () => deliverFile(tokens.CIV, slug, iso('Civil Movilidad', 'C', 2, 'P02'), bytesOf(SUPPLIERS[4].good, `${run}-CIV-fix`)))
      if (!fix.ok) frictions.push(`Reenvío corregido rechazado: ${fix.error.code}`)
      drain('Validación del reenvío')
      for (const n of issues) await timed(`Resolver issue #${n}`, () => paidApi.patchIssue(n, { status: 'resolved' }))
    }
  })

  it('5. clashes shared between two members, then the record of the site', async () => {
    as('coord')
    const recs: Record<string, unknown> = {}
    for (let i = 0; i < 25; i++) recs[`ARQ×EST-${run}-${i}`] = { status: i < 5 ? 'resolved' : 'active', label: `Muro × viga ${i}`, assignee: i % 2 ? 'Estructuras Vela' : 'Arquitectura Vela', note: i === 0 ? 'Bajar la viga 10 cm' : undefined }
    const put = await timed('Colisiones: subir 25 estados (ARQ×EST)', () => fetch(`${API}/clash/records`, { method: 'PUT', headers: { Authorization: `Bearer dev:user_pilotcoord:${ORG}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ project: `pilot-${run}`, records: recs }) }).then((r) => r.status))
    expect(put).toBe(200)
    const got = await timed('Colisiones: otro miembro las lee', () => fetch(`${API}/clash/records?project=pilot-${run}`, { headers: { Authorization: `Bearer dev:user_pilotowner:${ORG}` } }).then((r) => r.json() as Promise<{ records: Record<string, unknown> }>), (j) => `${Object.keys(j.records ?? {}).length} estados`)
    expect(Object.keys(got.records ?? {})).toHaveLength(25)
    as('owner')
    const box = await timed('Cola de correo: cargar', () => paidApi.outbox())
    const audit = await timed('Registro de auditoría: cargar', () => paidApi.audit())
    const final = await paidApi.deliveries()
    const mine: ApiDelivery[] = final.ok ? final.value.deliveries.filter((d) => d.file_name.startsWith(project())) : []
    steps.push({ step: 'Resultado', ms: 0, note: `${mine.length} entregas; correos en cola ${box.ok ? box.value.messages.filter((m) => m.subject.includes(project()) || m.subject.includes('Entrega')).length : '?'}; ${audit.ok ? audit.value.events.length : '?'} eventos de auditoría` })
    writeFileSync(process.env.PILOT_OUT ?? 'pilot-result.json', JSON.stringify({ run, project: project(), steps, frictions, deliveries: mine.map((d) => ({ file: d.file_name, supplier: d.supplier, score: d.score, verdict: d.verdict, reason: d.reason })) }, null, 2))
  })
})
