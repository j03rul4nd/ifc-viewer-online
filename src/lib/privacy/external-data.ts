// ─── external data from links and scenes ──────────────────────────────────────
// A shared link (`?layers=`) or a scene document can carry data layers and
// live twin sources — URLs on other people's servers. Loaded as soon as the
// page opened, every one of those servers saw the visitor's IP address (and,
// for a layer on the map, the site's area) before the visitor had done
// anything. Now the visitor is told which servers, once, and decides.
//
// Not asked:
//   - inside another website's frame: that page decided what it shows, as it
//     does for the map's tiles (see useGeoEffects). A frame of this same site
//     (the blog's live examples) asks like any page;
//   - for what the visitor added themselves (layers saved on this device);
//   - when no URL leaves this origin.

import { create } from 'zustand'
import { isEmbeddedByOtherSite } from '../url-params'

export type ExternalDataKind = 'layers' | 'layersUrl' | 'twin' | 'scene'

interface PendingRequest {
  kind: ExternalDataKind
  hosts: string[]
  resolve(accepted: boolean): void
}

interface ExternalDataPromptState {
  queue: PendingRequest[]
  answer(accepted: boolean): void
}

export const useExternalDataPrompt = create<ExternalDataPromptState>()((set, get) => ({
  queue: [],
  answer: (accepted) => {
    const [first, ...rest] = get().queue
    set({ queue: rest })
    first?.resolve(accepted)
  },
}))

/** Hosts of every http(s)/ws(s) URL anywhere in a value, excluding this origin. Sorted, unique. */
export function hostsIn(value: unknown, ownHost = typeof location !== 'undefined' ? location.host : ''): string[] {
  const out = new Set<string>()
  const seen = new Set<unknown>()
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi)) {
        try {
          const h = new URL(m[0]).host
          if (h && h !== ownHost) out.add(h)
        } catch { /* not a URL after all */ }
      }
      return
    }
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(x)
  }
  walk(value)
  return [...out].sort()
}

/**
 * Every server a data-layers setup would contact: the URLs it spells out and
 * those of the ready-made sources it names by id (a scene's `"preset": "bicing"`
 * carries no URL at all — the four demo scenes are written that way).
 */
export async function layersSetupHosts(doc: unknown): Promise<string[]> {
  const ids = new Set<string>()
  const seen = new Set<unknown>()
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const o = v as Record<string, unknown>
    if (typeof o.preset === 'string') ids.add(o.preset)
    for (const x of Array.isArray(v) ? v : Object.values(o)) walk(x)
  }
  walk(doc)
  let presets: unknown[] = []
  if (ids.size) {
    const { FEED_PRESETS } = await import('../layers/feed-presets')
    presets = FEED_PRESETS.filter((p) => ids.has(p.id))
  }
  return hostsIn([doc, presets])
}

/**
 * Ask the visitor before a link or scene loads data from other servers.
 * Resolves true straight away when there is nothing to ask (no foreign host,
 * or another website frames the app).
 */
export function confirmExternalData(kind: ExternalDataKind, hosts: string[]): Promise<boolean> {
  if (hosts.length === 0 || isEmbeddedByOtherSite()) return Promise.resolve(true)
  return new Promise((resolve) => {
    useExternalDataPrompt.setState((s) => ({ queue: [...s.queue, { kind, hosts, resolve }] }))
  })
}
