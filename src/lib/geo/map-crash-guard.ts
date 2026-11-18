// ─── map-crash-guard ──────────────────────────────────────────────────────────
// iPhone Safari kills the WebContent process (silent page reload, no JS error,
// no webglcontextlost) when the 3D map pushes memory past its budget. Restoring
// the same heavy layers from localStorage on the reload would kill it again.
//
// Guard: a sessionStorage flag is set right before the heavy map enable and
// cleared once the map has been stable for STABLE_MS (or on pagehide). If the
// flag is still there when the page starts, the previous enable died → that
// session runs in "safe map mode" (heavy layers off, localStorage untouched).

export const CRASH_FLAG_KEY = 'ifc-geo-map-arming:v1'
export const STABLE_MS = 20_000

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function session(): KV | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage } catch { return null }
}

/** Mark "heavy map enable in progress". */
export function armMapCrashGuard(store: KV | null = session()): void {
  try { store?.setItem(CRASH_FLAG_KEY, String(Date.now())) } catch { /* quota/private mode */ }
}

/** The map survived (stable or the page is leaving on purpose). */
export function disarmMapCrashGuard(store: KV | null = session()): void {
  try { store?.removeItem(CRASH_FLAG_KEY) } catch { /* ignore */ }
}

/**
 * Called once at startup. True when the previous map enable never disarmed —
 * i.e. the page was killed under it. Clears the flag so the safe mode is
 * entered once, not forever.
 */
export function consumeMapCrashFlag(store: KV | null = session()): boolean {
  try {
    if (!store || store.getItem(CRASH_FLAG_KEY) === null) return false
    store.removeItem(CRASH_FLAG_KEY)
    return true
  } catch { return false }
}

export interface SafeMapOverrides {
  terrainEnabled: false
  buildingsEnabled: false
  vehicles: false
  contextDetail: 'simple'
}

/** Session-only overrides for safe map mode, applied on top of persisted prefs. */
export function safeMapOverrides<L extends object>(featureLayers: L): SafeMapOverrides & { featureLayers: L } {
  const off = Object.fromEntries(Object.keys(featureLayers).map((k) => [k, false])) as L
  return { terrainEnabled: false, buildingsEnabled: false, vehicles: false, contextDetail: 'simple', featureLayers: off }
}

let disarmTimer: ReturnType<typeof setTimeout> | null = null
let pagehideBound = false

/**
 * Arm before the heavy enable; disarm STABLE_MS after `markStable()` or on
 * pagehide (a deliberate navigation is not a crash).
 */
export function armForMapEnable(): { markStable: () => void } {
  armMapCrashGuard()
  if (!pagehideBound && typeof window !== 'undefined') {
    pagehideBound = true
    window.addEventListener('pagehide', () => disarmMapCrashGuard())
  }
  return {
    markStable: () => {
      if (disarmTimer !== null) clearTimeout(disarmTimer)
      disarmTimer = setTimeout(() => { disarmTimer = null; disarmMapCrashGuard() }, STABLE_MS)
    },
  }
}
