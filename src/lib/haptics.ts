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
//
// iPhone: Safari has no Vibration API, but since iOS 18 toggling a native
// `<input type="checkbox" switch>` plays the system selection haptic — the
// same tick a Settings switch gives. Clicking a hidden one from inside a user
// gesture borrows it. It is a single fixed tick, so every kind maps to it and
// the multi-pulse patterns become one or two ticks. Older iOS ignores the
// `switch` attribute and the click is silent, which is the old behaviour.

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

function vibrateSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** iOS / iPadOS Safari (iPadOS reports as Mac, but has touch points). */
function isAppleTouch(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function supported(): boolean {
  return !reducedMotion && (vibrateSupported() || isAppleTouch())
}

// One hidden switch, created on first use and reused. A <label> wrapping it is
// what gets clicked: clicking the input directly does not fire the haptic.
let switchLabel: HTMLLabelElement | null = null
function iosTick(): void {
  if (typeof document === 'undefined' || !document.body) return
  if (!switchLabel || !switchLabel.isConnected) {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    switchLabel = label
  }
  switchLabel.click()
}

/** How many ticks stand in for a pattern on iOS. */
const IOS_TICKS: Record<HapticKind, number> = { tick: 1, light: 1, select: 1, success: 2, warning: 2, error: 2 }

/** Fire a semantic haptic. No-ops silently where the platform doesn't support it. */
export function haptic(kind: HapticKind = 'tick'): void {
  if (!supported()) return
  try {
    if (vibrateSupported()) { navigator.vibrate(PATTERNS[kind]); return }
    iosTick()
    // A second tick reads as "done" / "careful" — spaced so iOS does not merge them.
    if (IOS_TICKS[kind] > 1) setTimeout(iosTick, 90)
  } catch {
    /* some browsers throw if called without a user gesture — ignore */
  }
}

/** True when the current device can actually produce a vibration (for gating UI copy). */
export function hapticSupported(): boolean {
  return supported()
}
