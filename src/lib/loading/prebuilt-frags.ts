// ─── Prebuilt fragments ───────────────────────────────────────────────────────
// The IFC files we ship are converted once, offline (scripts/frags), into
// /models-frag/<id>.frag, listed in /models-frag/manifest.json under the same
// sampled fingerprint the loader computes for any file. On a cache miss the IFC
// adapter asks here first: a hit is the finished geometry, downloaded instead
// of converted — seconds instead of tens of seconds, and none of the
// conversion's ~5× memory peak, which is what an iPhone cannot afford.
//
// Matched by content, so the gallery, scenes, embeds and a visitor dropping the
// same file all hit. Every failure is a miss: the caller converts as before.

import { createLogger } from '../logger'

const log = createLogger('Prebuilt')

interface Manifest {
  version: 1
  entries: Record<string, { frag: string; fragBytes: number; tree?: string }>
}

let manifest: Promise<Manifest | null> | null = null

function base(): string {
  try { return import.meta.env.BASE_URL || '/' } catch { return '/' }
}

function loadManifest(): Promise<Manifest | null> {
  if (!manifest) {
    manifest = fetch(`${base()}models-frag/manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() as Promise<Manifest> : null))
      .then((m) => (m && m.version === 1 && m.entries ? m : null))
      .catch((err: unknown) => {
        log.debug('no prebuilt manifest:', err)
        return null
      })
  }
  return manifest
}

/** The prebuilt fragments for this `f1:` fingerprint, or null (no entry, offline, bad response). */
export async function findPrebuiltFragments(fingerprint: string | null, signal: AbortSignal): Promise<ArrayBuffer | null> {
  if (!fingerprint || !fingerprint.startsWith('f1:') || typeof fetch !== 'function') return null
  const m = await loadManifest()
  const entry = m?.entries[fingerprint]
  if (!entry) return null
  try {
    const res = await fetch(`${base()}models-frag/${entry.frag}`, { signal, cache: 'force-cache' })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || (entry.fragBytes && buf.byteLength !== entry.fragBytes)) return null
    log.info(`prebuilt fragments for ${fingerprint} (${(buf.byteLength / 1e6).toFixed(1)} MB)`)
    return buf
  } catch (err) {
    if (signal.aborted) throw err
    log.debug('prebuilt fetch failed — converting:', err)
    return null
  }
}

export interface PrebuiltTree {
  tree: unknown
  decomp: [number, number[]][] | null
}

/**
 * The spatial tree built offline for this `f1:` fingerprint, or null. What the
 * validator worker would answer to `build-tree` — without the second web-ifc
 * parse of the whole file that a phone cannot afford next to the viewer.
 */
export async function findPrebuiltTree(fingerprint: string | null, signal?: AbortSignal): Promise<PrebuiltTree | null> {
  if (!fingerprint || !fingerprint.startsWith('f1:') || typeof fetch !== 'function') return null
  const entry = (await loadManifest())?.entries[fingerprint]
  if (!entry?.tree) return null
  try {
    const res = await fetch(`${base()}models-frag/${entry.tree}`, { signal, cache: 'force-cache' })
    if (!res.ok) return null
    const body = await res.json() as { tree?: unknown; decomp?: unknown }
    if (!Array.isArray(body.tree)) return null
    return { tree: body.tree, decomp: Array.isArray(body.decomp) ? body.decomp as [number, number[]][] : null }
  } catch (err) {
    if (signal?.aborted) throw err
    log.debug('prebuilt tree fetch failed — building it:', err)
    return null
  }
}

/** Tests only. */
export function __resetPrebuiltManifest(): void {
  manifest = null
}
