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
  entries: Record<string, { frag: string; fragBytes: number; tree?: string; ifc?: string }>
}

// ── Warm-up by URL ────────────────────────────────────────────────────────────
// A model we ship is matched by its content, so the lookup has to wait for
// the IFC download — and the .frag download then starts only after it: two
// transfers in a row. When a load starts from one of our own URLs the manifest
// already says which .frag (and tree) it will be, so both start alongside the
// IFC and the lookup claims them. Same bytes either way (the content match
// still decides); a warm-up nobody claims is dropped after a minute.

const WARM_TTL_MS = 60_000
const warm = new Map<string, { at: number; body: Promise<Response | null> }>()

function startWarm(file: string): void {
  if (warm.has(file)) return
  const body = fetch(`${base()}models-frag/${file}`, { cache: 'force-cache' })
    .then((r) => (r.ok ? r : null))
    .catch(() => null)
  warm.set(file, { at: Date.now(), body })
  setTimeout(() => { if (warm.get(file)?.body === body) warm.delete(file) }, WARM_TTL_MS)
}

function claim(file: string): Promise<Response | null> | null {
  const w = warm.get(file)
  if (!w) return null
  warm.delete(file)
  return Date.now() - w.at < WARM_TTL_MS ? w.body : null
}

/**
 * The load of `url` is starting: if it is one of the IFC files we ship, start
 * fetching its fragments and tree now, in parallel with the IFC itself.
 * Fire and forget; any failure leaves the normal lookup to run.
 */
export function warmPrebuiltForUrl(url: string): void {
  if (typeof fetch !== 'function') return
  let path: string
  try {
    const u = new URL(url, globalThis.location?.href)
    if (globalThis.location && u.origin !== globalThis.location.origin) return
    path = decodeURIComponent(u.pathname)
  } catch { return }
  const root = base()
  if (!path.startsWith(root)) return
  const rel = path.slice(root.length)
  void loadManifest().then((m) => {
    const entry = m && Object.values(m.entries).find((e) => e.ifc === rel)
    if (!entry) return
    startWarm(entry.frag)
    if (entry.tree) startWarm(entry.tree)
  })
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
    const res = (await claim(entry.frag)) ?? await fetch(`${base()}models-frag/${entry.frag}`, { signal, cache: 'force-cache' })
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
    const res = (await claim(entry.tree)) ?? await fetch(`${base()}models-frag/${entry.tree}`, { signal, cache: 'force-cache' })
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
  warm.clear()
}
