// ─── observability ────────────────────────────────────────────────────────────
// Which modelled elements did the capture actually LOOK AT?
//
// Normative reference: docs/AS_BUILT_SCORE_PLAN.md §3.3 and §4 (piece 4).
//
// This is the honesty floor of the As-Built Score. Everything downstream is
// allowed to judge only what this module says was seen; an element nobody
// filmed must never reach the scorer as a pass. Getting this wrong does not
// look like a bug — it looks like a capture that scores 100.
//
// Method: reproject each sampled surface point into every camera and compare the
// depth we EXPECT (how far the sample is) against the depth the camera OBSERVED.
// That is the same test as multiview_filter() in the fusion experiment, which
// phase 1 already validated; here it answers a different question about the same
// geometry, so the two must not drift apart.
//
// Pure module: plain arithmetic and typed arrays. No three.js, no DOM.

/** What the cameras collectively concluded about one element. */
export type ObservationState = 'observed' | 'occluded' | 'unobserved'

/**
 * One reconstructed view: intrinsics, pose, and the metric depth behind it.
 *
 * `w2c` is world→camera in **column-major order, exactly THREE.Matrix4.elements**
 * — every caller in this repo gets its matrices from three.js, and silently
 * transposing one produces a plausible-looking result that is wrong everywhere,
 * which is the worst failure mode available here.
 *
 * The camera convention is OpenCV (+X right, +Y down, +Z forward), matching what
 * blender_capture.py writes and what every depth model emits.
 */
export interface DepthFrame {
  width: number
  height: number
  /**
   * Metric depth along the optical axis, row-major, `width × height`.
   * 0 (or negative) means NO DATA, which is not the same as "nothing is there" —
   * see `noData` in SampleVerdict.
   */
  depth: Float32Array
  fx: number
  fy: number
  cx: number
  cy: number
  /** World→camera, column-major (THREE.Matrix4.elements layout). */
  w2c: ArrayLike<number>
}

export interface ObservabilityOptions {
  /**
   * Independent cameras that must see a sample before it counts as observed.
   * Two by default: a single witness is regularly a depth-map artefact, and the
   * fusion stage already uses the same threshold for the same reason.
   */
  minWitnesses?: number
  /** Depth agreement band as a fraction of range. 2% mirrors the fusion filter. */
  toleranceRel?: number
  /** Absolute floor for the agreement band, metres. Keeps close-range sane. */
  toleranceMinM?: number
  /**
   * Fraction of an element's samples that must be witnessed for the element to
   * count as observed. Deliberately low: seeing a third of a column is plenty to
   * judge where it is, and demanding more would mark most of a real capture
   * unobserved.
   */
  minVisibleFraction?: number
}

const DEFAULTS: Required<ObservabilityOptions> = {
  minWitnesses: 2,
  toleranceRel: 0.02,
  toleranceMinM: 0.01,
  minVisibleFraction: 0.3,
}

/** Per-element tally. Every count is over the element's sampled surface points. */
export interface ElementObservation {
  id: number
  state: ObservationState
  sampleCount: number
  /**
   * Samples facing at least one camera — the denominator every fraction below
   * is taken over. Equals `sampleCount` when no normals were supplied.
   */
  testable: number
  /** Samples that landed inside at least one camera's image and in front of it. */
  inFrustum: number
  /** Samples witnessed by at least `minWitnesses` cameras. */
  visible: number
  /** Samples that were in frustum but always hidden behind nearer geometry. */
  occluded: number
  /**
   * Samples where a camera saw PAST where the surface should be — it reported a
   * surface further away, through the element.
   *
   * This is positive evidence of ABSENCE, not of occlusion, and it is the signal
   * that separates "modelled but not built" from "hidden behind scaffolding".
   * The scorer needs that distinction; without it every unbuilt element hides
   * behind the benefit of the doubt.
   */
  seenPast: number
  visibleFraction: number
}

/** Samples for one element, as flat triplet arrays in scene metres. */
export interface ElementSamples {
  id: number
  /** 3 × n, scene-space metres. */
  positions: Float32Array
  /**
   * 3 × n outward surface normals, scene space. Optional, but supply them.
   *
   * Without normals a wall is sampled on both faces, and the face pointing away
   * from the room can never be seen — the camera hits the near face first, so
   * every one of those samples is scored "occluded". Measured on the synthetic
   * room, that alone dragged coverage from usable to 0%: ten walls, all reported
   * as blocked, in a capture that saw every one of them. A surface that no
   * camera could ever face is not missing coverage, it is outside the question.
   */
  normals?: Float32Array
}

/** Outcome of testing one sample against one camera. */
const enum Verdict { BackFacing, OutOfFrustum, NoData, Visible, Occluded, SeenPast }

/**
 * Test one sample against one frame.
 *
 * Kept as a module-level function taking primitives so the hot loop allocates
 * nothing: this runs samples × cameras times, which is tens of millions on a
 * real model.
 */
function testSample(frame: DepthFrame, x: number, y: number, z: number,
                    nx: number, ny: number, nz: number, hasNormal: boolean,
                    toleranceRel: number, toleranceMinM: number): Verdict {
  const m = frame.w2c
  // Column-major: element(row, col) === m[col * 4 + row].
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14]
  if (!(cz > 1e-6)) return Verdict.OutOfFrustum          // behind the camera

  const cx = m[0] * x + m[4] * y + m[8] * z + m[12]
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13]

  if (hasNormal) {
    // Rotate the normal into the camera and compare it with the viewing ray. A
    // surface turned away from this camera is not something this camera failed
    // to see; it is something it was never able to see.
    const rx = m[0] * nx + m[4] * ny + m[8] * nz
    const ry = m[1] * nx + m[5] * ny + m[9] * nz
    const rz = m[2] * nx + m[6] * ny + m[10] * nz
    if (rx * cx + ry * cy + rz * cz >= 0) return Verdict.BackFacing
  }

  const u = Math.round(frame.fx * cx / cz + frame.cx)
  const v = Math.round(frame.fy * cy / cz + frame.cy)
  if (u < 0 || v < 0 || u >= frame.width || v >= frame.height) return Verdict.OutOfFrustum

  const observed = frame.depth[v * frame.width + u]
  // No depth here at all. A real estimator leaves holes (sky, glass, texture-less
  // patches), and a hole is not evidence of anything — treating it as absence
  // would invent missing elements out of bad lighting.
  if (!(observed > 1e-6)) return Verdict.NoData

  const tolerance = Math.max(toleranceMinM, toleranceRel * cz)
  if (Math.abs(observed - cz) <= tolerance) return Verdict.Visible
  // Something nearer than the sample: the element may well be there, we just
  // cannot see it from here. Never evidence against the element.
  return observed < cz ? Verdict.Occluded : Verdict.SeenPast
}

/**
 * Classify every element by what the capture could see of it.
 *
 * Cost is O(samples × frames). Callers should sample surfaces at a density that
 * matches the question — a few hundred points per element is ample — rather than
 * feeding this the full tessellation.
 */
export function classifyObservability(
  elements: readonly ElementSamples[],
  frames: readonly DepthFrame[],
  options: ObservabilityOptions = {},
): ElementObservation[] {
  const o = { ...DEFAULTS, ...options }
  const results: ElementObservation[] = []

  for (const element of elements) {
    const sampleCount = Math.floor(element.positions.length / 3)
    const normals = element.normals
    const hasNormal = !!normals && normals.length >= sampleCount * 3
    let inFrustum = 0, visible = 0, occluded = 0, seenPast = 0, testable = 0

    for (let s = 0; s < sampleCount; s++) {
      const x = element.positions[s * 3]
      const y = element.positions[s * 3 + 1]
      const z = element.positions[s * 3 + 2]
      const nx = hasNormal ? normals![s * 3] : 0
      const ny = hasNormal ? normals![s * 3 + 1] : 0
      const nz = hasNormal ? normals![s * 3 + 2] : 0

      let witnesses = 0, occluders = 0, past = 0, seenByAny = false, faceable = false

      for (const frame of frames) {
        const verdict = testSample(frame, x, y, z, nx, ny, nz, hasNormal,
                                   o.toleranceRel, o.toleranceMinM)
        if (verdict === Verdict.BackFacing) continue
        // Front-facing to SOME camera, whether or not it fell inside the image:
        // this is a surface the capture could in principle have covered, so it
        // belongs in the denominator even when the capture missed it.
        faceable = true
        // A hole in the depth map is not a sighting. Counting it as one would
        // let an element the capture knows nothing about be reported as
        // "in frame but blocked", which reads as a capture problem the user
        // could fix by moving the scaffolding — when in fact we never had data.
        if (verdict === Verdict.OutOfFrustum || verdict === Verdict.NoData) continue
        seenByAny = true
        if (verdict === Verdict.Visible) witnesses++
        else if (verdict === Verdict.Occluded) occluders++
        else if (verdict === Verdict.SeenPast) past++
      }

      if (faceable) testable++
      if (!seenByAny) continue
      inFrustum++
      if (witnesses >= o.minWitnesses) visible++
      // A sample nobody could confirm is occluded only if something was actually
      // in the way. Falling back to "occluded" whenever confirmation failed
      // would quietly excuse every element the capture is too poor to judge.
      else if (past >= o.minWitnesses) seenPast++
      else if (occluders > 0) occluded++
    }

    // Fractions are taken over TESTABLE samples, not over every sample: the
    // denominator is the surface a camera could ever have faced.
    const visibleFraction = testable > 0 ? visible / testable : 0
    // What matters for scoreability is whether the capture reached a CONCLUSION
    // about the element, and "the cameras saw straight through it" is as firm a
    // conclusion as "there it is". Counting only `visible` here would file every
    // unbuilt element as occluded and quietly exempt it from the score — the
    // exact benefit of the doubt this module exists to withhold.
    const determinedFraction = testable > 0 ? (visible + seenPast) / testable : 0
    results.push({
      id: element.id,
      state: resolveState(inFrustum, determinedFraction, o.minVisibleFraction),
      sampleCount, testable, inFrustum, visible, occluded, seenPast, visibleFraction,
    })
  }

  return results
}

function resolveState(inFrustum: number, determinedFraction: number,
                      minVisibleFraction: number): ObservationState {
  // Never entered any image: the capture simply does not cover this element, and
  // saying anything else about it would be invention.
  if (inFrustum === 0) return 'unobserved'
  if (determinedFraction >= minVisibleFraction) return 'observed'
  // In frame, but the capture could not settle what is there — blocked, or the
  // depth was too poor to confirm. Not judged, and therefore not scored.
  return 'occluded'
}

/**
 * Fraction of a model the capture can actually judge.
 *
 * This is the number §3.3 requires to be printed beside every score, and the one
 * the phase-2 kill criterion is measured against: if a normal 2-minute phone
 * video cannot clear MIN_COVERAGE_FRACTION on a real storey, the score cannot be
 * emitted in the real use case and the phase stops.
 */
export function observedFraction(observations: readonly ElementObservation[]): number {
  if (observations.length === 0) return 0
  let observed = 0
  for (const obs of observations) if (obs.state === 'observed') observed++
  return observed / observations.length
}
