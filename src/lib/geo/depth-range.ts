// ─── depth range ──────────────────────────────────────────────────────────────
// NEAR AND FAR FOR A SCENE THAT IS A DISTRICT AND A BUILDING AT THE SAME TIME.
//
// ── The bug this exists to reduce ─────────────────────────────────────────────
//
// Map mode takes the camera planes over from the viewer — `setSceneTuneLock`
// exists precisely to stop the viewer re-tuning them underneath it — and then
// sets them ONCE, statically: near at most 0.5 m, far 60 km.
//
// A depth buffer does not spend its precision evenly. For a standard projection
// the smallest depth difference resolvable at distance z is about
//
//     Δz ≈ z² / (near · 2^bits)
//
// so near is the only term anyone can move, and it moves the answer linearly.
// At near = 0.5 the buffer resolves about 1 cm at 300 m. Two surfaces built
// closer together than that — a curtain wall and the spandrel set into it,
// which is most of what a glazed facade IS — land on the same depth value and
// flicker against each other as the camera moves.
//
// ── What this does NOT fix, and it matters ────────────────────────────────────
//
// EXACTLY COINCIDENT FACES. Where an IFC contains two faces in literally the
// same plane, no depth precision resolves them: Δz is zero at any near plane.
// That needs `polygonOffset` or de-duplicated geometry, and it is a separate
// job in the model pipeline, not here. So this narrows the band of separations
// that fight — from "under a centimetre" to "under a tenth of a millimetre" —
// and if flicker survives it, the cause was coincidence and not precision.
// Which is itself worth knowing, and is why the two are not fixed together.
//
// ── Why not a logarithmic depth buffer ────────────────────────────────────────
//
// It would fix the precision half outright, and it is the wrong tool here: it
// is a renderer CONSTRUCTION flag, so it cannot be switched on when map mode
// opens and off when it closes, it costs a per-fragment depth write in every
// other view the viewer has, and it interacts badly with the postprocessing
// SSAO path. Paying that permanently to fix one mode is a bad trade when the
// mode can stop asking for a near plane it does not need.
//
// PURE: numbers in, numbers out. No camera, no THREE, no scene.

/** Depth buffer the target platforms actually give us. */
export const DEPTH_BITS = 24

/**
 * Depth separation the buffer should resolve at whatever the camera is looking
 * at, metres.
 *
 * A tenth of a millimetre. Chosen against real construction rather than for a
 * round number: a curtain wall and its spandrel are set apart in centimetres, a
 * cladding panel and its substrate in millimetres, and anything closer than
 * this in an architectural model is coincident by intent rather than by
 * dimension — which no near plane can help with.
 */
export const TARGET_RESOLUTION_M = 0.0001

/**
 * Closest the near plane may ever sit, metres.
 *
 * Walking pace is the constraint: a person's eye passes within arm's reach of
 * a wall, and clipping through it is far more visible than z-fighting on a
 * facade behind it.
 */
export const MIN_NEAR_M = 0.25

/**
 * Largest share of the viewing distance the near plane may take.
 *
 * The safety rail on the formula below, and asymmetric on purpose: too near
 * costs precision, too far costs GEOMETRY — the thing being looked at
 * disappears into the near plane, which is unrecoverable for a user who does
 * not know why.
 */
export const MAX_NEAR_FRACTION = 0.05

export interface DepthRange {
  nearM: number
  farM: number
  /** Smallest depth difference resolvable at `atM`, metres. */
  resolutionAtM: (atM: number) => number
  /**
   * True where the clipping cap, not the precision goal, decided the near plane.
   *
   * THE TWO CONSTRAINTS GENUINELY CONFLICT and pretending otherwise would be
   * the dishonest version of this module. Past roughly 100 m, resolving a tenth
   * of a millimetre would need a near plane further out than the safety rail
   * allows, so the rail wins and the goal is missed. That is the right call —
   * clipping the model is worse than flicker on it — but it is a real limit and
   * it is reported rather than hidden. A caller that wants better at long range
   * has to change the depth buffer, not the planes.
   */
  clipLimited: boolean
}

/** Δz ≈ z² / (near · 2^bits): what the buffer can tell apart at distance z. */
export function depthResolutionM(nearM: number, atM: number): number {
  return (atM * atM) / (Math.max(1e-6, nearM) * 2 ** DEPTH_BITS)
}

/**
 * Camera planes for a viewer standing `distanceM` from what it is looking at.
 *
 * The far plane is fixed by the scene: the map genuinely runs to the horizon,
 * and pulling it in to buy precision would cut the horizon off, which is a
 * worse picture than a little flicker. It is also nearly free to leave alone —
 * far appears in the precision formula only as a vanishing correction, which is
 * the part of this that is unintuitive and the reason the first version of this
 * module chased the far/near RATIO and got the wrong answer. The ratio is a
 * symptom. The near plane is the whole cause.
 */
export function depthRangeFor(distanceM: number, farM: number): DepthRange {
  const distance = Number.isFinite(distanceM) && distanceM > 0 ? distanceM : MIN_NEAR_M

  // Invert the precision formula: the near plane that resolves the target
  // separation at the distance the camera is actually focused on.
  const wanted = (distance * distance) / (TARGET_RESOLUTION_M * 2 ** DEPTH_BITS)

  // Precedence, and it is not symmetric. The cap is a safety rail against
  // clipping the subject; the floor is a safety rail against clipping a wall
  // the camera is pressed against. Where they cross — very close range — the
  // FLOOR wins, because at 1 m from a surface there is nothing behind it whose
  // precision is worth losing that surface for.
  const cap = Math.max(MIN_NEAR_M, distance * MAX_NEAR_FRACTION)
  const nearM = Math.max(MIN_NEAR_M, Math.min(wanted, cap))
  // A near plane past the far plane inverts the projection matrix and produces
  // a black screen with no error. Cheap to rule out, miserable to diagnose.
  const safeFar = Math.max(nearM * 2, farM)

  return {
    nearM,
    farM: safeFar,
    resolutionAtM: (atM) => depthResolutionM(nearM, atM),
    clipLimited: wanted > cap,
  }
}

/**
 * Whether a change is worth paying a projection-matrix update for.
 *
 * The planes are recomputed every frame; writing them every frame would
 * invalidate the projection matrix on frames where nothing moved. A tenth of a
 * percent is far below what any depth comparison can notice.
 */
export function depthRangeChanged(a: DepthRange | null, b: DepthRange): boolean {
  if (!a) return true
  return Math.abs(a.nearM - b.nearM) > a.nearM * 1e-3
}
