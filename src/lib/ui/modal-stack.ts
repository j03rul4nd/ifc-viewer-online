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
// PURE: no DOM, no React. The listener that turns a keypress into a close lives
// in Modal, which knows when it is mounted.

/** First layer above the floating panels (z-20) and the app chrome. */
export const MODAL_BASE_Z = 300

/** Room between layers for a backdrop and its card. */
const LAYER_STRIDE = 2

let stack: string[] = []

/** Reset between tests. Not used by the app. */
export function resetModalStack(): void {
  stack = []
}

/** Ids currently open, bottom first. */
export function modalStack(): string[] {
  return [...stack]
}

/** Push a modal onto the stack, or move it to the top if it is already there. */
export function pushModal(id: string): void {
  stack = stack.filter((s) => s !== id)
  stack.push(id)
}

export function popModal(id: string): void {
  stack = stack.filter((s) => s !== id)
}

/** True when this modal is the one the user is actually looking at. */
export function isTopModal(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id
}

/**
 * The z-index for a modal's backdrop. Its card sits one above.
 *
 * Derived from the position in the stack rather than chosen, so a dialog opened
 * from a dialog is always in front of it — which is the entire point of opening
 * it.
 */
export function modalZIndex(id: string): number {
  const index = stack.indexOf(id)
  return MODAL_BASE_Z + (index < 0 ? 0 : index) * LAYER_STRIDE
}

/** Any modal open? `panel-registry` needs to know to yield Escape. */
export function anyModalOpen(): boolean {
  return stack.length > 0
}
