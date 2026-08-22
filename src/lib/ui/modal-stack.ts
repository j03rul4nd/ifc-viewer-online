// ─── modal-stack ──────────────────────────────────────────────────────────────
// Who is on top, and who owns the Escape key.
//
// Ten dialogs used to answer this with hard-coded z-index values — 70, 72, 80,
// 85, 100, 200 — assigned by whoever wrote each one. Two that can be open
// together stack in the order their numbers happen to fall rather than the order
// the user opened them, and every one of them listened for Escape, so a dialog
// opened over another closed both.
//
// The order is the order things were opened. That is the only rule a person
// could predict, so it is the one worth implementing.
//
// A modal is also EXCLUSIVE, and in two directions. It closes any modal already
// open, because a dialog is a question and asking two at once is not a thing the
// app ever wants to do. And it closes the floating panels, because you could
// have the selected element's properties sitting beside a dialog — two windows
// claiming to be the thing you are working on. The stack survives because
// exclusivity is a policy about who is allowed in, not about how they layer.
//
// PURE: no DOM, no React. The listener that turns a keypress into a close lives
// in Modal, which knows when it is mounted.

/** First layer above the floating panels (z-20) and the app chrome. */
export const MODAL_BASE_Z = 300

/** Room between layers for a backdrop and its card. */
const LAYER_STRIDE = 2

interface Layer { id: string; close: () => void }

let stack: Layer[] = []

/**
 * What to close when a modal takes over.
 *
 * A set rather than one function, and injected rather than imported: this
 * module must not know about the panel registry (which imports it back) or
 * about the properties column (which is not in that registry, because it is
 * stepped aside by panels rather than closed by them). Each of them hands in
 * its own closer.
 */
const closers = new Set<() => void>()

/** Register something a modal should dismiss. Returns the way to unregister. */
export function addPanelCloser(fn: () => void): () => void {
  closers.add(fn)
  return () => { closers.delete(fn) }
}

/** Reset between tests. Not used by the app. */
export function resetPanelClosers(): void {
  closers.clear()
}

/** Reset between tests. Not used by the app. */
export function resetModalStack(): void {
  stack = []
}

/** Ids currently open, bottom first. */
export function modalStack(): string[] {
  return stack.map((l) => l.id)
}

/**
 * Open a modal, closing whatever else was claiming the screen.
 *
 * `close` is invoked on the modals being dismissed, never on the one opening,
 * and a modal that re-announces (a re-render with the same id) keeps its place
 * instead of closing itself.
 */
export function pushModal(id: string, close: () => void = () => {}): void {
  const already = stack.find((l) => l.id === id)
  if (already) { already.close = close; return }
  for (const layer of stack) layer.close()
  // The panels go too: a dialog and an element's properties side by side are
  // two windows both claiming to be what you are working on.
  for (const close of closers) close()
  stack = [{ id, close }]
}

export function popModal(id: string): void {
  stack = stack.filter((l) => l.id !== id)
}

/** True when this modal is the one the user is actually looking at. */
export function isTopModal(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id
}

/**
 * The z-index for a modal's backdrop. Its card sits one above.
 *
 * Derived from the position in the stack rather than chosen, so a dialog opened
 * from a dialog is always in front of it — which is the entire point of opening
 * it.
 */
export function modalZIndex(id: string): number {
  const index = stack.findIndex((l) => l.id === id)
  return MODAL_BASE_Z + (index < 0 ? 0 : index) * LAYER_STRIDE
}

/** Any modal open? `panel-registry` needs to know to yield Escape. */
export function anyModalOpen(): boolean {
  return stack.length > 0
}
