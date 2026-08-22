// ─── panel-registry ──────────────────────────────────────────────────
// The rules every floating panel obeys, in one place.
//
// The shell (ViewportPanel) already made them LOOK alike. What was missing is
// that they had no idea about each other: eight panels, eight open flags living
// in eight different stores, all rendering into the same slot at the right edge.
// Open two and they stacked; each one closed by its own affordance; and whether
// Escape did anything depended on which panel you happened to be in. From the
// outside that reads as "every window works differently", because it did.
//
// This module owns the part that has to be shared, and nothing else:
//
//   ONE AT A TIME  — opening a panel closes the others. They occupy the same
//                    place on screen, so overlapping is never what was wanted.
//   ESCAPE CLOSES  — the same key, in every panel, without each one wiring it.
//   LAST IN, FIRST — the panel that opened most recently is the one Escape takes.
//
// It is deliberately NOT a store of open state. Each panel keeps its own flag,
// because those flags are already driven from the toolbar, the mobile nav, SDK
// commands and deep links — roughly a hundred call sites. Centralising them
// would be a large, risky refactor to reach a behaviour that is fully described
// by "tell me when you open, and give me a way to close you".
//
// PURE apart from the listener set, so the ordering rules are testable without
// mounting anything.

import { anyModalOpen } from './modal-stack'

export type PanelId = string

interface Entry {
  id: PanelId
  close: () => void
  /** Monotonic open order — decides who Escape takes first. */
  seq: number
}

const open = new Map<PanelId, Entry>()
let counter = 0

/** Reset between tests. Not used by the app. */
export function resetPanelRegistry(): void {
  open.clear()
  counter = 0
  detachEscape?.()
  detachEscape = null
}

/** Panels currently open, oldest first. Exported for tests and diagnostics. */
export function openPanels(): PanelId[] {
  return [...open.values()].sort((a, b) => a.seq - b.seq).map((e) => e.id)
}

/**
 * Announce that a panel is open.
 *
 * Closes every other open panel first. `close` is invoked on the panels being
 * dismissed, never on the one opening, and a panel that re-announces (a re-render
 * with the same id) keeps its place rather than closing itself.
 */
export function announceOpen(id: PanelId, close: () => void): void {
  const existing = open.get(id)
  if (existing) {
    // Same panel, new render. Keep the original order so a re-render does not
    // promote it past a panel that genuinely opened later.
    existing.close = close
    return
  }
  for (const entry of [...open.values()]) {
    if (entry.id === id) continue
    open.delete(entry.id)
    entry.close()
  }
  open.set(id, { id, close, seq: ++counter })
  syncEscapeListener()
}

/** Announce that a panel is closed, however it was closed. */
export function announceClosed(id: PanelId): void {
  open.delete(id)
  syncEscapeListener()
}

// ── Escape ────────────────────────────────────────────────────────────────────
// ONE listener for all of them, installed while any panel is open and removed
// when the last one closes. One listener per panel would close as many panels as
// happened to be registered on a single keypress; one listener in the app shell
// would put the rule somewhere other than with the rules it belongs to.

let detachEscape: (() => void) | null = null

/**
 * A dialog is on top and owns the key.
 *
 * Without this, a modal opened over a panel would close the PANEL BEHIND IT —
 * the one the user cannot even see — and leave the modal standing.
 *
 * Asked TWO ways, on purpose. The modal stack is the reliable answer and the
 * only one that survives a dialog forgetting an attribute; the DOM query is
 * kept for anything not yet built on `Modal`, and for a third-party dialog that
 * will never be in our stack at all. Originally this was the DOM query alone,
 * and six of the ten dialogs in the app did not set `role="dialog"` — so Escape
 * over those closed the panel behind them.
 */
function modalIsOpen(): boolean {
  if (anyModalOpen()) return true
  if (typeof document === 'undefined') return false
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}

function syncEscapeListener(): void {
  if (typeof window === 'undefined') return
  if (open.size > 0 && !detachEscape) {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || modalIsOpen()) return
      if (closeTopPanel()) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    detachEscape = () => window.removeEventListener('keydown', onKey)
  } else if (open.size === 0 && detachEscape) {
    detachEscape()
    detachEscape = null
  }
}

/**
 * Close the most recently opened panel and report whether there was one.
 *
 * The caller decides what to do when nothing was open — Escape means different
 * things elsewhere in the app (clearing a selection, leaving a section view),
 * and swallowing the key here would break those.
 */
export function closeTopPanel(): boolean {
  let top: Entry | null = null
  for (const entry of open.values()) if (!top || entry.seq > top.seq) top = entry
  if (!top) return false
  open.delete(top.id)
  top.close()
  syncEscapeListener()
  return true
}
