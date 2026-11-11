// ─── Managed requirements (B2) ────────────────────────────────────────────────
// A receiver on the Reception plan keeps its requirements as a profile with
// numbered versions (routes/ruleset-versions.ts in ifc-cloud-api). A link made
// from a profile carries the profile id, the version current at the time, and a
// snapshot of that version (the normal `#r=` payload). When the supplier opens
// it:
//
//   · the app asks the public endpoint for the version that is current NOW and
//     checks against that; the verdict says which version it was;
//   · if the service is off or unreachable, the snapshot is used — a v1 link
//     never stops working, whatever happens to the account or the server.
//
// Reading what you must meet is free and needs no account (Joel, 2026-11-11);
// defining, versioning and the history are the paid part.

import { sanitizeRequirements, type RequirementsPayload } from './requirements-link'

export interface CheckedVersion {
  /** Version the link was made at. */
  linked: number
  /** Version the model is checked against. */
  checked: number
  /** Profile name, when known. */
  name?: string
  /** Note of the checked version (when fetched). */
  note?: string
  /** True when `checked` came from the service; false = the link's own snapshot. */
  live: boolean
}

export interface PublicRequirements {
  id: string
  name: string
  version: number
  latest: number
  note: string
  content: string
  published_at: string
}

export type PublicFetcher = (id: string) => Promise<PublicRequirements | null>

const TIMEOUT_MS = 6000

/** GET <api>/requirements/:id — no token: a supplier has no account. */
export function publicFetcher(apiBase: string, fetchImpl: typeof fetch = fetch): PublicFetcher {
  const base = apiBase.replace(/\/$/, '')
  return async (id) => {
    if (!base) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetchImpl(`${base}/requirements/${encodeURIComponent(id)}`, { signal: controller.signal })
      if (!res.ok) return null
      return (await res.json()) as PublicRequirements
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * The requirements to check a model against, and the version that is. Never
 * throws and never returns less than the link itself.
 */
export async function resolveManagedRequirements(
  req: RequirementsPayload,
  fetcher: PublicFetcher | null,
): Promise<{ req: RequirementsPayload; version: CheckedVersion | null }> {
  if (!req.pr) return { req, version: null }
  const snapshot = { req, version: { linked: req.pr.v, checked: req.pr.v, name: req.pr.nm, live: false } }
  if (!fetcher) return snapshot
  const remote = await fetcher(req.pr.id).catch(() => null)
  if (!remote || !Number.isInteger(remote.version) || remote.version < 1) return snapshot
  let parsed: unknown
  try { parsed = JSON.parse(remote.content) } catch { return snapshot }
  const current = sanitizeRequirements(parsed)
  if (!current) return snapshot
  const name = typeof remote.name === 'string' && remote.name.trim() ? remote.name.trim().slice(0, 120) : req.pr.nm
  current.pr = { id: req.pr.id, v: remote.version, ...(name ? { nm: name } : {}) }
  return {
    req: current,
    version: {
      linked: req.pr.v,
      checked: remote.version,
      name,
      note: typeof remote.note === 'string' ? remote.note.slice(0, 500) : undefined,
      live: true,
    },
  }
}
