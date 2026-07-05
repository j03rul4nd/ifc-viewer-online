// ─── haptics ─────────────────────────────────────────────────────────────────
// Tiny, dependency-free wrapper over navigator.vibrate for the mobile UI. This
// is what makes a web gesture feel *committed* rather than coincidental — the
// same tick TikTok/Instagram fire on nearly every state change (tab switch,
// sheet detent settle, swipe commit, run completion).
//
// Fire-and-forget, module-level helper (mirrors toastStore's `toast()`): callable
// from lib code and components alike. Silently no-ops where unsupported (iOS
// Safari has no Vibration API — that's fine, the visual spring still plays) and
// respects prefers-reduced-motion. Never throws.

type HapticKind =
  | 'tick'     // lightest — selection / chip / tab change
  | 'light'    // a hair firmer — expand/collapse, row press
  | 'select'   // detent settle, snap
  | 'success'  // run passed / positive outcome
  | 'warning'  // run has errors / caution
  | 'error'    // failed / destructive

// Short, distinct patterns. Numbers are ms; arrays alternate vibrate/pause.
const PATTERNS: Record<HapticKind, number | number[]> = {
  tick:    8,
  light:   12,
  select:  [10, 18, 14],
  success: [12, 40, 18],
  warning: [16, 60, 16],
  error:   [24, 40, 24, 40, 24],
}

let reducedMotion = false
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  try {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion = mql.matches
    mql.addEventListener?.('change', (e) => { reducedMotion = e.matches })
  } catch {
    /* matchMedia unavailable — leave reducedMotion false */
  }
}

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function' &&
    !reducedMotion
  )
}

/** Fire a semantic haptic. No-ops silently where the platform doesn't support it. */
export function haptic(kind: HapticKind = 'tick'): void {
  if (!supported()) return
  try {
    navigator.vibrate(PATTERNS[kind])
  } catch {
    /* some browsers throw if called without a user gesture — ignore */
  }
}

/** True when the current device can actually produce a vibration (for gating UI copy). */
export function hapticSupported(): boolean {
  return supported()
}
