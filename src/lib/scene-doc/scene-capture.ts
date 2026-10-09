// ─── scene-capture ────────────────────────────────────────────────────────────
// The current view written back in the deep-link grammar a scene document
// uses — the inverse of what `?bg=`, `?map=` and `?model=` parse. Pure, so the
// round trip (capture → scene → parse) can be tested without a viewer.

import type { BackgroundSettings } from '../scene/background'

/** A background as `?bg=` would say it; undefined for the default studio look. */
export function backgroundToSpec(b: BackgroundSettings): string | undefined {
  if (b.preset !== 'custom') return b.preset === 'studio' ? undefined : b.preset
  return b.mode === 'gradient' && b.bottom !== b.top ? `${b.top},${b.bottom}` : b.top
}

/** The map state as `?map=` would say it; undefined when the map is off. */
export function mapToSpec(g: { mapMode: string; terrainEnabled: boolean; buildingsEnabled: boolean; contextDetail?: string }): string | undefined {
  if (g.mapMode !== 'on' && g.mapMode !== 'starting') return undefined
  const parts = [
    g.terrainEnabled ? 'terrain' : null,
    g.buildingsEnabled ? 'buildings' : null,
    g.contextDetail === 'showcase' ? 'showcase' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(',') : '1'
}

/**
 * A model URL as a scene should keep it: same-origin files as a "/" path, so
 * the scene opens identically on a preview deployment, localhost and the
 * production site; anything else verbatim.
 */
export function portableModelUrl(url: string, origin: string): string {
  try {
    const u = new URL(url, origin)
    return u.origin === origin ? `${u.pathname}${u.search}` : u.toString()
  } catch {
    return url
  }
}

/** Round a camera to millimetres: a scene file is read by people too. */
export function roundVec(v: { x: number; y: number; z: number }): [number, number, number] {
  return [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000) as [number, number, number]
}
