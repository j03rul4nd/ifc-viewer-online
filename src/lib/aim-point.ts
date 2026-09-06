// ─── aim-point ────────────────────────────────────────────────────────────────
// WHERE THE USER IS POINTING, which is not always where the cursor is.
//
// Orbiting, it is the cursor. Under Pointer Lock there IS no cursor: the
// browser freezes clientX/clientY at wherever it was captured, so every hover
// and every click keeps picking whatever happened to be under the mouse at the
// moment walking started — an element on the other side of the room, forever.
// While the pointer is locked the aim is the centre of the canvas, which is
// what the crosshair in the HUD draws and what a first-person view means by
// "the thing in front of you".
//
// ── Why this is a module and not four lines inside the viewer ─────────────────
//
// It WAS four lines inside the viewer, and they shipped broken: the branch that
// handles the ordinary, unlocked case called the enclosing function instead of
// setting the point, so aiming recursed until the stack overflowed. Every
// pointer move and every click threw, which silently killed hover highlighting,
// element selection and the right-click menu — everything except walking, which
// takes the other branch and was the only path anyone tested.
//
// The logic is a pure function of four numbers and a boolean. Out here it can
// be tested, and the case that broke is the first test in the file.
//
// PURE: numbers in, a point out. No DOM, no THREE, no viewer.

/** The canvas rectangle, in client coordinates. */
export interface AimRect {
  left: number
  top: number
  width: number
  height: number
}

export interface AimPoint {
  x: number
  y: number
}

/**
 * The point to raycast through, in CLIENT coordinates.
 *
 * Client rather than normalised device coordinates on purpose: every caller
 * hands the result to a fragments raycast along with `dom: canvas`, and lets
 * fragments do the offset arithmetic. The canvas does not start at the top-left
 * of the viewport — it sits under the toolbar — and converting here would mean
 * doing that correction twice.
 */
export function aimPoint(
  pointerLocked: boolean,
  rect: AimRect,
  clientX: number,
  clientY: number,
): AimPoint {
  if (!pointerLocked) return { x: clientX, y: clientY }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}
