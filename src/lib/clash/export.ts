// ─── clash export: BCF topics and the coordination report ─────────────────────
// Viewpoints are built in SCENE axes (Y up); exportBcfZip converts them to the
// IFC axes and real coordinates a .bcfv is written in.

import type { BcfTopic, BcfViewpoint } from '../../types'
import { groupClashes, statusCounts, type ClashRecord, type ClashResult, type ClashStatus } from './model'
import { clashText, type ClashTextKey } from './i18n'

const BCF_STATUS: Record<ClashStatus, string> = { new: 'Open', active: 'Active', resolved: 'Resolved', approved: 'Closed' }

/** A camera looking at the clash point from above and to the side. */
export function clashViewpoint(r: ClashResult, guid: string): BcfViewpoint {
  const [x, y, z] = r.point
  const dist = 4
  const pos = { x: x + dist * 0.6, y: y + dist * 0.55, z: z + dist * 0.6 }
  const dx = x - pos.x, dy = y - pos.y, dz = z - pos.z
  const len = Math.hypot(dx, dy, dz)
  const dir = { x: dx / len, y: dy / len, z: dz / len }
  // up = (dir × worldUp) × dir, normalised
  const rx = dir.y * 0 - dir.z * 1, ry = dir.z * 0 - dir.x * 0, rz = dir.x * 1 - dir.y * 0
  const ux = ry * dir.z - rz * dir.y, uy = rz * dir.x - rx * dir.z, uz = rx * dir.y - ry * dir.x
  const ul = Math.hypot(ux, uy, uz) || 1
  return {
    guid,
    cameraPosition: pos,
    cameraDirection: dir,
    cameraUp: { x: ux / ul, y: uy / ul, z: uz / ul },
    fieldOfView: 60,
    componentGuids: [r.a.guid, r.b.guid].filter((g): g is string => !!g),
  }
}

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`)

const mm = (m: number) => Math.round(m * 1000)

export function clashTitle(r: ClashResult): string {
  const name = (e: ClashResult['a']) => e.name ? `${e.name}` : `${e.category} #${e.localId}`
  return `${name(r.a)} × ${name(r.b)}`
}

export function clashesToBcfTopics(
  results: ClashResult[],
  records: Record<string, ClashRecord>,
  testName: (id: string) => string,
  author = 'IFC Viewer Online',
): BcfTopic[] {
  return results.map((r) => {
    const rec = records[r.key]
    const what = r.kind === 'hard' ? `overlap ${mm(r.depth)} mm` : `gap ${mm(r.distance)} mm`
    return {
      guid: uuid(),
      title: clashTitle(r),
      description: [
        `${testName(r.test)} · ${r.kind} · ${what}`,
        `A: ${r.a.category} ${r.a.guid ?? ''} (${r.a.fileName})`,
        `B: ${r.b.category} ${r.b.guid ?? ''} (${r.b.fileName})`,
        r.a.storey || r.b.storey ? `Storey: ${r.a.storey || r.b.storey}` : '',
        rec?.note ? `Note: ${rec.note}` : '',
      ].filter(Boolean).join('\n'),
      status: BCF_STATUS[rec?.status ?? 'new'],
      topicType: 'Clash',
      priority: r.kind === 'hard' ? 'High' : 'Normal',
      creationDate: new Date().toISOString(),
      creationAuthor: author,
      assignedTo: rec?.assignee || undefined,
      dueDate: rec?.due ? new Date(rec.due).toISOString() : undefined,
      labels: [testName(r.test), r.a.storey || r.b.storey].filter(Boolean) as string[],
      viewpoints: [clashViewpoint(r, uuid())],
      comments: [],
      source: 'generated',
    } satisfies BcfTopic
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A printable coordination report (HTML document): totals by status, then by
 * test, storey and person, then the open clashes. Plain HTML + print CSS so
 * the browser's "Save as PDF" makes the file — no PDF library, no server.
 */
export function coordinationReportHtml(opts: {
  lang: string
  project: string
  results: ClashResult[]
  records: Record<string, ClashRecord>
  testName: (id: string) => string
  now?: Date
}): string {
  const { lang, project, results, records, testName } = opts
  const t = (k: ClashTextKey) => clashText(lang, k)
  const now = opts.now ?? new Date()
  const counts = statusCounts(records, results.map((r) => r.key))
  const resolved = Object.values(records).filter((r) => r.status === 'resolved').length
  const statusOf = (r: ClashResult): ClashStatus => records[r.key]?.status ?? 'new'
  const open = results.filter((r) => statusOf(r) === 'new' || statusOf(r) === 'active')
  const table = (title: string, rows: Array<[string, number, number]>) => `
  <h2>${esc(title)}</h2>
  <table><thead><tr><th></th><th>${esc(t('clashes'))}</th><th>${esc(t('open'))}</th></tr></thead><tbody>
  ${rows.map(([l, n, o]) => `<tr><td>${esc(l)}</td><td>${n}</td><td>${o}</td></tr>`).join('')}
  </tbody></table>`
  const rowsOf = (by: 'test' | 'storey') => groupClashes(results, by, testName).map((g) => [g.label, g.clashes.length, g.clashes.filter((r) => open.includes(r)).length] as [string, number, number])
  const people = new Map<string, [number, number]>()
  for (const r of results) {
    const who = records[r.key]?.assignee || t('unassigned')
    const v = people.get(who) ?? [0, 0]
    v[0]++; if (open.includes(r)) v[1]++
    people.set(who, v)
  }
  const statusLine = (['new', 'active', 'approved'] as const).map((s) => `<span class="pill">${esc(t(`status_${s}`))}: ${counts[s]}</span>`).join(' ')
  return `<!doctype html>
<html lang="${esc(lang.slice(0, 2))}"><head><meta charset="utf-8"><title>${esc(t('reportTitle'))} · ${esc(project)}</title>
<style>
  body{font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d232a;margin:32px;max-width:900px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #d5dbe1;padding-bottom:4px}
  .meta{color:#5b6670;margin-bottom:12px} .pill{display:inline-block;border:1px solid #c9d1d8;border-radius:999px;padding:1px 8px;margin-right:6px}
  table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #eef1f4;vertical-align:top}
  th{font-weight:600;color:#5b6670} td.n{font-variant-numeric:tabular-nums}
  @media print{body{margin:12mm} h2{break-after:avoid}}
</style></head><body>
  <h1>${esc(t('reportTitle'))}</h1>
  <div class="meta">${esc(project)} · ${esc(t('generated'))} ${esc(now.toISOString().slice(0, 16).replace('T', ' '))}</div>
  <div>${esc(t('total'))}: <b>${results.length}</b> · ${statusLine} <span class="pill">${esc(t('status_resolved'))}: ${resolved}</span></div>
  ${table(t('byTest'), rowsOf('test'))}
  ${table(t('byStorey'), rowsOf('storey'))}
  ${table(t('byAssignee'), [...people.entries()].sort((a, b) => b[1][1] - a[1][1]).map(([k, v]) => [k, v[0], v[1]]))}
  <h2>${esc(t('open'))} (${open.length})</h2>
  <table><thead><tr><th>#</th><th>${esc(t('element'))}</th><th>${esc(t('location'))}</th><th>${esc(t('assignee'))}</th><th>${esc(t('due'))}</th></tr></thead><tbody>
  ${open.slice(0, 500).map((r, i) => {
    const rec = records[r.key]
    const what = r.kind === 'hard' ? `${mm(r.depth)} mm` : `${mm(r.distance)} mm`
    return `<tr><td class="n">${i + 1}</td><td>${esc(clashTitle(r))}<br><small>${esc(testName(r.test))} · ${esc(what)}</small></td><td>${esc(r.a.storey || r.b.storey || '—')}</td><td>${esc(rec?.assignee || '—')}</td><td>${esc(rec?.due || '—')}</td></tr>`
  }).join('')}
  </tbody></table>
</body></html>`
}
