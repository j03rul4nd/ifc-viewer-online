// ─── Delivery register ────────────────────────────────────────────────────────
// Every invitation, delivery and decision is one line. Each line carries the
// SHA-256 of its own canonical text joined to the previous line's hash, so
// changing or removing any past line breaks every hash after it. Computed with
// Web Crypto in the browser; `verifyChain` recomputes it.

import type { RxDelivery, RxSupplier } from './sample'

export type RegisterEvent = 'invited' | 'received' | 'accepted' | 'returned'

export interface RegisterEntry {
  seq: number
  at: string
  event: RegisterEvent
  supplierId: string
  /** File name for deliveries and decisions; e-mail for invitations. */
  subject: string
  by: string
  /** SHA-256 of the delivered file (sample: of its name and time, there is no file). */
  fileHash: string | null
  detail: string
  prevHash: string
  hash: string
}

export type DraftEntry = Omit<RegisterEntry, 'seq' | 'prevHash' | 'hash' | 'fileHash'> & { fileHash?: string | null }

export const GENESIS = '0'.repeat(64)

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The exact text that is hashed: fixed field order, tab-separated. */
export function canonicalLine(e: Omit<RegisterEntry, 'hash'>): string {
  return [e.seq, e.at, e.event, e.supplierId, e.subject, e.by, e.fileHash ?? '', e.detail, e.prevHash].join('\t')
}

export async function appendEntry(chain: RegisterEntry[], draft: DraftEntry): Promise<RegisterEntry[]> {
  const prev = chain.slice(-1)[0]
  const base = { ...draft, fileHash: draft.fileHash ?? null, seq: (prev?.seq ?? 0) + 1, prevHash: prev?.hash ?? GENESIS }
  return [...chain, { ...base, hash: await sha256Hex(canonicalLine(base)) }]
}

export async function buildChain(drafts: DraftEntry[]): Promise<RegisterEntry[]> {
  let chain: RegisterEntry[] = []
  for (const d of [...drafts].sort((a, b) => a.at.localeCompare(b.at))) chain = await appendEntry(chain, d)
  return chain
}

/** null when intact; otherwise the first line whose hash does not match. */
export async function verifyChain(chain: RegisterEntry[]): Promise<number | null> {
  let prev = GENESIS
  for (const e of chain) {
    const { hash, ...rest } = e
    if (e.prevHash !== prev || (await sha256Hex(canonicalLine(rest))) !== hash) return e.seq
    prev = hash
  }
  return null
}

/** The register drafts implied by the suppliers and deliveries. */
export async function draftsFrom(suppliers: RxSupplier[], deliveries: RxDelivery[]): Promise<DraftEntry[]> {
  const out: DraftEntry[] = suppliers.map((s) => ({ at: `${s.invitedAt}T08:00:00Z`, event: 'invited', supplierId: s.id, subject: s.email, by: 'Laura Méndez', detail: s.originator }))
  for (const d of deliveries) {
    out.push({ at: d.receivedAt, event: 'received', supplierId: d.supplierId, subject: d.fileName, by: d.supplierId, fileHash: await sha256Hex(`${d.fileName}@${d.receivedAt}`), detail: d.score === null ? 'unreadable' : `score ${d.score} · profile v${d.profileVersion}` })
    if (d.verdict !== 'pending' && d.decidedAt) {
      out.push({ at: d.decidedAt, event: d.verdict, supplierId: d.supplierId, subject: d.fileName, by: d.decidedBy ?? '', detail: d.reasons.join(' | ') })
    }
  }
  return out
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function registerCsv(chain: RegisterEntry[], supplierName: (id: string) => string): string {
  const head = ['seq', 'utc_time', 'event', 'supplier', 'file_or_email', 'by', 'file_sha256', 'detail', 'prev_hash', 'hash']
  const rows = chain.map((e) => [e.seq, e.at, e.event, supplierName(e.supplierId), e.subject, e.event === 'received' ? supplierName(e.by) : e.by, e.fileHash, e.detail, e.prevHash, e.hash])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
