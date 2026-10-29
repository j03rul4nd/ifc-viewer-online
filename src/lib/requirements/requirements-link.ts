// ─── Requirements links ───────────────────────────────────────────────────────
// A receiver (contractor, owner, public body) packs its delivery requirements
// into a link: a minimum Health Score, a built-in validation profile and/or an
// IDS. A supplier who opens it checks its own model against exactly those
// requirements, in its browser, and gets a pass/fail verdict.
//
// Same design as the tour links (tourShareLink.ts): everything travels in the
// URL **fragment** (`#r=…`), which never reaches a server. The payload is
// compressed (deflate-raw, CompressionStream) because an IDS is XML and runs to
// kilobytes; a `j` prefix marks an uncompressed payload for browsers without
// CompressionStream.

import { VALIDATION_PROFILES } from '../../types'

export const REQUIREMENTS_LINK_VERSION = 1

/** Mirror of the share/tour guards — beyond this, chat apps and mail clients mangle URLs. */
export const MAX_REQUIREMENTS_URL_LEN = 8000

export const MAX_REQ_TITLE = 120
export const MAX_REQ_ISSUER = 80
/** Raw IDS XML accepted in a link (before compression). */
export const MAX_REQ_IDS_CHARS = 200_000

export interface RequirementsPayload {
  v: number
  /** What is being delivered ("Structural model, stage 2"). */
  t: string
  /** Who sets the requirements ("Construcciones Pérez"). */
  i?: string
  /** Minimum Health Score, 0–100. */
  s?: number
  /** Built-in validation profile id the score is computed with. */
  p?: string
  /** IDS XML the model must pass. */
  x?: string
  /** File name of that IDS, for display. */
  xn?: string
}

const BUILTIN_PROFILE_IDS = new Set(VALIDATION_PROFILES.map((p) => p.id))

/** At least one requirement; title always present. */
export function hasRequirement(p: Pick<RequirementsPayload, 's' | 'x'>): boolean {
  return typeof p.s === 'number' || typeof p.x === 'string'
}

// ── base64url ─────────────────────────────────────────────────────────────────

function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(text: string): Uint8Array {
  let b64 = text.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const canCompress = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const reader = source.pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// ── Codec ─────────────────────────────────────────────────────────────────────

export async function encodeRequirements(payload: RequirementsPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload))
  if (canCompress()) {
    return 'z' + bytesToB64url(await pipeBytes(json, new CompressionStream('deflate-raw')))
  }
  return 'j' + bytesToB64url(json)
}

export async function decodeRequirements(encoded: string): Promise<RequirementsPayload | null> {
  try {
    let text = encoded
    if (text.includes('%')) text = decodeURIComponent(text)
    const kind = text[0]
    let bytes = b64urlToBytes(text.slice(1))
    if (kind === 'z') {
      if (!canCompress()) return null
      bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'))
    } else if (kind !== 'j') {
      return null
    }
    return sanitizeRequirements(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

/** Validate untrusted decoded data into a well-formed payload (or null). */
export function sanitizeRequirements(raw: unknown): RequirementsPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.v !== REQUIREMENTS_LINK_VERSION) return null
  if (typeof r.t !== 'string' || !r.t.trim()) return null
  const out: RequirementsPayload = { v: REQUIREMENTS_LINK_VERSION, t: r.t.trim().slice(0, MAX_REQ_TITLE) }
  if (typeof r.i === 'string' && r.i.trim()) out.i = r.i.trim().slice(0, MAX_REQ_ISSUER)
  if (typeof r.s === 'number' && Number.isFinite(r.s)) out.s = Math.min(100, Math.max(0, Math.round(r.s)))
  if (typeof r.p === 'string' && BUILTIN_PROFILE_IDS.has(r.p)) out.p = r.p
  if (typeof r.x === 'string' && r.x.trim() && r.x.length <= MAX_REQ_IDS_CHARS) {
    out.x = r.x
    if (typeof r.xn === 'string' && r.xn.trim()) out.xn = r.xn.trim().slice(0, MAX_REQ_TITLE)
  }
  return hasRequirement(out) ? out : null
}

// ── URLs ──────────────────────────────────────────────────────────────────────

export const REQUIREMENTS_HASH_PREFIX = '#r='

/** The encoded part of a `#r=` fragment, or null. */
export function requirementsFromHash(hash: string): string | null {
  return hash.startsWith(REQUIREMENTS_HASH_PREFIX) ? hash.slice(REQUIREMENTS_HASH_PREFIX.length) : null
}

export type BuildRequirementsUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'no-requirement' | 'too-long' }

/** `<app>/?req=1#r=<payload>` — `req=1` only marks the link in logs and analytics. */
export async function buildRequirementsUrl(appUrl: string, payload: RequirementsPayload): Promise<BuildRequirementsUrlResult> {
  if (!hasRequirement(payload)) return { ok: false, reason: 'no-requirement' }
  const u = new URL(appUrl)
  u.search = ''
  u.hash = ''
  u.searchParams.set('req', '1')
  const url = `${u.toString()}${REQUIREMENTS_HASH_PREFIX}${await encodeRequirements(payload)}`
  return url.length > MAX_REQUIREMENTS_URL_LEN ? { ok: false, reason: 'too-long' } : { ok: true, url }
}

// ── Verdict ───────────────────────────────────────────────────────────────────

export type CheckState = 'pending' | 'pass' | 'fail'

export interface RequirementsVerdict {
  state: CheckState
  score?: { state: CheckState; value: number | null; min: number }
  ids?: { state: CheckState; passed: number; total: number }
}

/**
 * Pass only when every requirement in the link is met; pending while any
 * result is still missing; fail as soon as one known result fails.
 */
export function evaluateRequirements(
  req: Pick<RequirementsPayload, 's' | 'x'>,
  results: { score: number | null; ids: { passedSpecs: number; failedSpecs: number; totalSpecs: number } | null },
): RequirementsVerdict {
  const verdict: RequirementsVerdict = { state: 'pending' }
  const states: CheckState[] = []
  if (typeof req.s === 'number') {
    const state: CheckState = results.score === null ? 'pending' : results.score >= req.s ? 'pass' : 'fail'
    verdict.score = { state, value: results.score, min: req.s }
    states.push(state)
  }
  if (typeof req.x === 'string') {
    const r = results.ids
    // Specs that apply to nothing in the model ("not applicable") do not fail it.
    const state: CheckState = r === null ? 'pending' : r.failedSpecs === 0 ? 'pass' : 'fail'
    verdict.ids = { state, passed: r?.passedSpecs ?? 0, total: r?.totalSpecs ?? 0 }
    states.push(state)
  }
  verdict.state = states.includes('fail') ? 'fail' : states.includes('pending') ? 'pending' : 'pass'
  return verdict
}
