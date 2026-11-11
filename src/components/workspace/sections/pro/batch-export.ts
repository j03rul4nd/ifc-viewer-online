// ─── Folder check: pure helpers ───────────────────────────────────────────────
// Which dropped files are checked, the run's status per file, and the CSV/BCF
// exports. No React here so it is tested directly (batch-export.test.ts).

import { strToU8, zipSync } from 'fflate'
import { MAX_FILES, MAX_TOTAL_MB, PASS_MARK, type BatchFile, type BatchStatus } from './pro-sample'

export interface Intake { accepted: BatchFile[]; skipped: string[]; overLimit: boolean }

/** Keeps .ifc (and .ifczip), skips the rest, and caps at 50 files / 2 GB. */
export function intake(files: { name: string; sizeMb: number }[]): Intake {
  const ifc = files.filter((f) => /\.(ifc|ifczip)$/i.test(f.name))
  const skipped = files.filter((f) => !/\.(ifc|ifczip)$/i.test(f.name)).map((f) => f.name)
  const accepted: BatchFile[] = []
  let total = 0
  for (const f of ifc) {
    if (accepted.length >= MAX_FILES || total + f.sizeMb > MAX_TOTAL_MB) break
    accepted.push(f); total += f.sizeMb
  }
  return { accepted, skipped, overLimit: accepted.length < ifc.length }
}

export function statusOf(f: BatchFile): BatchStatus {
  if (f.unreadable) return 'unreadable'
  return (f.score ?? 0) >= PASS_MARK ? 'pass' : 'fail'
}

const esc = (v: string | number) => {
  const s = String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: { file: BatchFile; status: BatchStatus }[], profile: string): string {
  const head = ['file', 'size_mb', 'profile', 'status', 'score', 'issues', 'worst_rule']
  const body = rows.map(({ file, status }) => [file.name, file.sizeMb, profile, status, file.score ?? '', file.issues ?? '', file.worstRule ?? ''].map(esc).join(','))
  return [head.join(','), ...body].join('\n') + '\n'
}

/** Deterministic GUID-shaped id so the same run exports the same BCF. */
function guid(seed: string): string {
  let h = 2166136261
  const hex: string[] = []
  for (let round = 0; round < 4; round++) {
    for (const c of seed + round) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    hex.push((h >>> 0).toString(16).padStart(8, '0'))
  }
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** BCF 2.1 zip: one topic per file that fails or can't be read. */
export function toBcf(rows: { file: BatchFile; status: BatchStatus }[], profile: string, date = '2026-11-11T09:00:00Z'): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'bcf.version': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>\n'),
  }
  for (const { file, status } of rows) {
    if (status !== 'fail' && status !== 'unreadable') continue
    const id = guid(file.name + profile)
    const title = status === 'unreadable' ? `${file.name}: could not be read` : `${file.name}: ${file.worstRule} (${file.issues} issues, score ${file.score})`
    files[`${id}/markup.bcf`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Markup>\n  <Header><File IfcProject="" isExternal="true"><Filename>${xml(file.name)}</Filename></File></Header>\n` +
      `  <Topic Guid="${id}" TopicType="Issue" TopicStatus="Open">\n    <Title>${xml(title)}</Title>\n    <Labels>${xml(profile)}</Labels>\n    <CreationDate>${date}</CreationDate>\n    <CreationAuthor>folder-check</CreationAuthor>\n  </Topic>\n</Markup>\n`)
  }
  return zipSync(files)
}

export function summary(rows: { status: BatchStatus; file: BatchFile }[]) {
  const done = rows.filter((r) => r.status === 'pass' || r.status === 'fail')
  return {
    pass: rows.filter((r) => r.status === 'pass').length,
    fail: rows.filter((r) => r.status === 'fail').length,
    unreadable: rows.filter((r) => r.status === 'unreadable').length,
    issues: done.reduce((n, r) => n + (r.file.issues ?? 0), 0),
    avg: done.length ? Math.round(done.reduce((n, r) => n + (r.file.score ?? 0), 0) / done.length) : 0,
  }
}
