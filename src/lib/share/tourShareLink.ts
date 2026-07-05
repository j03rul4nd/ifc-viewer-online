// ─── Shareable tour links (D-26 — extends the D-21 share mechanism) ────────────
// Encodes a tour (steps + template + title — NEVER the model) into a URL so a
// receiver opens the viewer and playback starts automatically. Same design as
// share-report.ts (D-21):
//   · payload → UTF-8-safe JSON → base64 in the URL **hash fragment**
//     (`#tour=…`) — fragments never reach a server, so today's link is as
//     private as the legacy `#report=` one;
//   · the payload shape is a CROSS-BOUNDARY CONTRACT kept flat/compact so a
//     future Cloudflare Worker route (`/t?d=<base64url>`) can decode it and
//     server-render an unfurl card without changing this codec;
//   · the model travels via the EXISTING `?model=` param — links are only
//     buildable when every loaded model has a public URL (honest limit,
//     surfaced by `buildTourShareUrl` returning `no-model-url`).

import type { Tour, TourStep, ValidationRuleId } from '../../types'

export const TOUR_SHARE_VERSION = 1

/** Mirror of share-report's guard — beyond this, browsers/chat apps mangle URLs. */
export const MAX_TOUR_URL_LEN = 8000

/** Hard caps applied on encode AND decode (a link is untrusted input). */
export const MAX_SHARE_STEPS = 30
export const MAX_SHARE_HIGHLIGHTS = 10
export const MAX_SHARE_CAPTION = 140

/** Compact wire form of one step: c = [px,py,pz,tx,ty,tz] (2-decimal). */
export interface TourShareStep {
  c: number[]
  r?: string
  s?: 'error' | 'warning' | 'info'
  k?: number
  n?: string
  h?: number[]
}

export interface TourSharePayload {
  v: number
  /** Tour title (shown in the player / future unfurl card). */
  t?: string
  /** Presentation template that produced the tour (D-26). */
  tpl?: string
  steps: TourShareStep[]
}

const round2 = (n: number): number => Math.round(n * 100) / 100

// ── Codec (same flavour as share-report.ts encode/decode) ──────────────────────

export function encodeTourPayload(payload: TourSharePayload): string {
  const json = JSON.stringify(payload)
  return btoa(unescape(encodeURIComponent(json)))
}

export function decodeTourPayload(encoded: string): TourSharePayload | null {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = decodeURIComponent(escape(atob(b64)))
    const raw: unknown = JSON.parse(json)
    return sanitizePayload(raw)
  } catch {
    return null
  }
}

/** Validate untrusted decoded data into a well-formed payload (or null). */
function sanitizePayload(raw: unknown): TourSharePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (p.v !== TOUR_SHARE_VERSION) return null
  if (!Array.isArray(p.steps) || p.steps.length === 0) return null

  const steps: TourShareStep[] = []
  for (const s of p.steps.slice(0, MAX_SHARE_STEPS)) {
    if (!s || typeof s !== 'object') return null
    const st = s as Record<string, unknown>
    const c = st.c
    if (!Array.isArray(c) || c.length !== 6 || !c.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    const out: TourShareStep = { c: c as number[] }
    if (typeof st.r === 'string' && st.r.length <= 64) out.r = st.r
    if (st.s === 'error' || st.s === 'warning' || st.s === 'info') out.s = st.s
    if (typeof st.k === 'number' && Number.isFinite(st.k) && st.k > 0) out.k = Math.floor(st.k)
    if (typeof st.n === 'string' && st.n.trim()) out.n = st.n.slice(0, MAX_SHARE_CAPTION)
    if (Array.isArray(st.h)) {
      const ids = st.h.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0)
      if (ids.length > 0) out.h = ids.slice(0, MAX_SHARE_HIGHLIGHTS)
    }
    steps.push(out)
  }

  return {
    v: TOUR_SHARE_VERSION,
    ...(typeof p.t === 'string' && p.t.trim() ? { t: p.t.slice(0, MAX_SHARE_CAPTION) } : {}),
    ...(typeof p.tpl === 'string' && p.tpl.length <= 32 ? { tpl: p.tpl } : {}),
    steps,
  }
}

// ── Tour ⇄ payload ─────────────────────────────────────────────────────────────

export function tourToPayload(tour: Tour, templateId?: string | null): TourSharePayload {
  return {
    v: TOUR_SHARE_VERSION,
    ...(tour.title ? { t: tour.title.slice(0, MAX_SHARE_CAPTION) } : {}),
    ...(templateId ? { tpl: templateId } : {}),
    steps: tour.steps.slice(0, MAX_SHARE_STEPS).map((step) => {
      const { position: p, target: t } = step.camera
      const out: TourShareStep = {
        c: [round2(p.x), round2(p.y), round2(p.z), round2(t.x), round2(t.y), round2(t.z)],
      }
      if (step.issueRuleId) out.r = step.issueRuleId
      if (step.issueSeverity) out.s = step.issueSeverity
      if (step.issueCount) out.k = step.issueCount
      if (step.caption) out.n = step.caption.slice(0, MAX_SHARE_CAPTION)
      if (step.highlightedExpressIds?.length) out.h = step.highlightedExpressIds.slice(0, MAX_SHARE_HIGHLIGHTS)
      return out
    }),
  }
}

/**
 * Rebuild a playable Tour from a decoded payload. modelId is intentionally
 * dropped in transit — on the receiver there is exactly one model context
 * (the `?model=` URLs), and highlights/isolate fall back to the active model.
 */
export function payloadToTour(payload: TourSharePayload): Tour {
  return {
    id: crypto.randomUUID(),
    title: payload.t ?? '',
    createdFrom: 'auto',
    steps: payload.steps.map((s): TourStep => ({
      id: crypto.randomUUID(),
      camera: {
        position: { x: s.c[0], y: s.c[1], z: s.c[2] },
        target:   { x: s.c[3], y: s.c[4], z: s.c[5] },
      },
      ...(s.r ? { issueRuleId: s.r as ValidationRuleId } : {}),
      ...(s.s ? { issueSeverity: s.s } : {}),
      ...(s.k ? { issueCount: s.k } : {}),
      ...(s.n ? { caption: s.n } : {}),
      ...(s.h?.length ? { highlightedExpressIds: s.h } : {}),
    })),
  }
}

// ── URL building / parsing ─────────────────────────────────────────────────────

export type TourShareUrlResult =
  | { ok: true; url: string }
  /** `no-model-url`: the model was loaded from disk — an honest, user-facing limit (D-26). */
  | { ok: false; reason: 'no-model-url' | 'too-long' | 'empty-tour' }

export interface TourShareUrlOptions {
  /** Public URLs of the loaded models (from ?model= / demo gallery). Empty = local file. */
  modelUrls: string[]
  /** Open the receiver in the client presentation skin (D-25). */
  clientMode: boolean
  templateId?: string | null
  /** Override for tests; defaults to the live origin + BASE_URL. */
  appBase?: string
}

export function buildTourShareUrl(tour: Tour, options: TourShareUrlOptions): TourShareUrlResult {
  if (tour.steps.length === 0) return { ok: false, reason: 'empty-tour' }
  const urls = options.modelUrls.filter(Boolean)
  if (urls.length === 0) return { ok: false, reason: 'no-model-url' }

  const appBase = options.appBase
    ?? (typeof window !== 'undefined'
      ? `${window.location.origin}${(import.meta.env.BASE_URL ?? '/')}`
      : '/')

  const params = new URLSearchParams()
  params.set('model', urls.join(','))
  if (options.clientMode) params.set('ui', 'client')

  const b64 = encodeTourPayload(tourToPayload(tour, options.templateId))
  const url = `${appBase}?${params.toString()}#tour=${b64}`
  if (url.length > MAX_TOUR_URL_LEN) return { ok: false, reason: 'too-long' }
  return { ok: true, url }
}

/** Extract + decode a `#tour=` fragment. Accepts a full hash string. */
export function parseTourHash(hash: string): TourSharePayload | null {
  const m = /^#tour=(.+)$/.exec(hash ?? '')
  return m ? decodeTourPayload(m[1]) : null
}
