// ─── Camera shots — rendered from the model, not recorded from the screen ──────
// A shot is a camera move described as data (orbit 90°, crane up, push in on
// an element…) that is rendered frame by frame from the 3D scene at the
// OUTPUT's resolution and aspect. That is the whole point: a 9:16 Reel framed
// for 9:16 from the start, instead of a 16:9 screen recording with the
// building cropped off both sides.
//
// Pure maths — no Three.js. `cameraAt(shot, t)` gives the eye, the target and
// the field of view at time t; the renderer (viewer.renderShotFrame) just
// places the camera there and draws.
//
// Y is up, as in the viewer.

export interface Vec3 { x: number; y: number; z: number }

export interface Bounds {
  center: Vec3
  size: Vec3
}

export type ShotType =
  | 'orbit'     // circle the model at a fixed height
  | 'reveal'    // start close and low, pull back and up to the whole model
  | 'crane'     // rise from eye level to an aerial view, target fixed
  | 'topDown'   // plan view that tilts down into a perspective
  | 'dollyIn'   // push in toward the model along one direction
  | 'flyby'     // lateral pass across the front
  | 'focus'     // slow arc around one element or area
  | 'path'      // fly through explicit camera keyframes (tour stops, custom moves)

export const SHOT_TYPES: readonly ShotType[] = ['orbit', 'reveal', 'crane', 'topDown', 'dollyIn', 'flyby', 'focus']

export type Easing =
  | 'linear' | 'easeInOut' | 'easeOut'
  | 'ramp'   // speed ramp: fast in, slow through the hero moment, fast out
  | 'easeIn' // accelerating — a push that gathers speed into the cut

export interface ShotSpec {
  type: ShotType
  durationSec: number
  /** What the camera frames. For 'focus', the element's box. */
  bounds: Bounds
  /** Output width/height — the framing is solved for this, not the screen. */
  aspect: number
  /** Vertical field of view, degrees. */
  fovDeg: number
  /** Heading the move starts from, degrees around Y (0 = looking along −Z from +Z). */
  headingDeg: number
  /** Degrees swept for orbit/focus (sign = direction). */
  sweepDeg: number
  /** Camera elevation above the horizon, degrees. */
  elevationDeg: number
  /** Extra room around the subject; 1 = the subject just touches the frame. */
  padding: number
  easing: Easing
  /**
   * 'path' only: the poses the camera flies through, in order. The move is
   * smoothed through them (Catmull-Rom on the eye, eased target), and time is
   * shared out by distance so the speed stays even between close and far stops.
   */
  keyframes?: CameraPose[]
  /**
   * 'path' only. 'distance' (default) shares time by how far the eye travels —
   * even speed between stops. 'even' gives every keyframe gap the same time:
   * with keyframes spaced geometrically that is an exponential zoom, the
   * "infinite zoom" that keeps the same apparent speed from a metre to a city.
   */
  pathTiming?: 'distance' | 'even'
}

export interface CameraPose {
  position: Vec3
  target: Vec3
  fovDeg: number
}

export const DEFAULT_FOV_DEG = 45

export function defaultShot(type: ShotType, bounds: Bounds, aspect: number, durationSec = 4): ShotSpec {
  const base: ShotSpec = {
    type, durationSec, bounds, aspect,
    fovDeg: DEFAULT_FOV_DEG,
    headingDeg: 35,
    sweepDeg: 60,
    elevationDeg: 24,
    padding: 1.15,
    easing: 'easeInOut',
  }
  switch (type) {
    case 'orbit':   return { ...base, sweepDeg: 90, easing: 'linear' }
    case 'reveal':  return { ...base, headingDeg: 20, elevationDeg: 12, easing: 'easeOut' }
    case 'crane':   return { ...base, elevationDeg: 55 }
    case 'topDown': return { ...base, elevationDeg: 30, headingDeg: 0 }
    case 'dollyIn': return { ...base, headingDeg: 30, elevationDeg: 18, easing: 'easeOut' }
    case 'flyby':   return { ...base, headingDeg: 0, elevationDeg: 10 }
    case 'focus':   return { ...base, sweepDeg: 40, elevationDeg: 28, padding: 1.6 }
    case 'path':    return { ...base, easing: 'easeInOut' }
  }
}

// ── Framing ────────────────────────────────────────────────────────────────────

/** Radius of the sphere enclosing the box. */
export function boundingRadius(b: Bounds): number {
  const { x, y, z } = b.size
  return Math.max(1e-3, Math.hypot(x, y, z) / 2)
}

/**
 * Distance at which the bounding sphere fills the frame, for BOTH fields of
 * view. The narrower one decides: in 9:16 that is the horizontal one, which is
 * why a vertical shot has to stand further back than the same shot in 16:9.
 */
export function fitDistance(b: Bounds, fovDeg: number, aspect: number, padding = 1): number {
  const vfov = rad(fovDeg)
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(0.05, aspect))
  const narrow = Math.min(vfov, hfov)
  return (boundingRadius(b) * Math.max(0.5, padding)) / Math.sin(narrow / 2)
}

/**
 * Tighter than the sphere fit: the distance at which all eight corners of the
 * box fit inside the frame when looking from `headingDeg`/`elevationDeg`. A
 * long, low building seen side-on fills a 9:16 frame at a fraction of the
 * sphere distance — the sphere is sized for its worst diagonal, which is
 * rarely the one on screen.
 *
 * For a camera at centre + d·dir looking at the centre, a corner offset v sits
 * at depth d − v·dir with screen offsets v·right and v·up, so it fits when
 * d ≥ v·dir + |v·right| / tan(hfov/2) and d ≥ v·dir + |v·up| / tan(vfov/2).
 */
export function fitDistanceForView(
  b: Bounds, fovDeg: number, aspect: number, headingDeg: number, elevationDeg: number, padding = 1,
): number {
  const dir = unit(orbitPoint({ x: 0, y: 0, z: 0 }, 1, headingDeg, elevationDeg))
  const fwd = { x: -dir.x, y: -dir.y, z: -dir.z }
  let right = cross(fwd, { x: 0, y: 1, z: 0 })
  // Looking straight down: any horizontal right-vector will do.
  if (Math.hypot(right.x, right.y, right.z) < 1e-6) right = { x: 1, y: 0, z: 0 }
  right = unit(right)
  const up = cross(right, fwd)
  const pad = Math.max(0.5, padding)
  const tanV = Math.tan(rad(fovDeg) / 2) / pad
  const tanH = (Math.tan(rad(fovDeg) / 2) * Math.max(0.05, aspect)) / pad
  const h = { x: b.size.x / 2, y: b.size.y / 2, z: b.size.z / 2 }
  let d = 0
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = { x: sx * h.x, y: sy * h.y, z: sz * h.z }
    const depth = dot(v, dir)
    d = Math.max(d, depth + Math.abs(dot(v, right)) / tanH, depth + Math.abs(dot(v, up)) / tanV)
  }
  // Never let the near plane cut into the model.
  return Math.max(d, boundingRadius(b) * 1.05)
}

/**
 * One distance for the whole move, from the tightest fit at several points
 * along its path — constant, so the building never "breathes" as the camera
 * turns to a side where it is wider.
 */
export function shotDistance(s: ShotSpec): number {
  const sweep = s.type === 'orbit' || s.type === 'focus' ? s.sweepDeg : s.type === 'reveal' ? 25 : s.type === 'crane' || s.type === 'topDown' ? 30 : 0
  let d = 0
  for (let i = 0; i <= 8; i++) {
    d = Math.max(d, fitDistanceForView(s.bounds, s.fovDeg, s.aspect, s.headingDeg + (sweep * i) / 8, s.elevationDeg, s.padding))
  }
  return d
}

// ── Sampling ───────────────────────────────────────────────────────────────────

/** Camera pose at `t` seconds into the shot. */
export function cameraAt(s: ShotSpec, t: number): CameraPose {
  const p = ease(s.easing, clamp01(s.durationSec > 0 ? t / s.durationSec : 1))
  if (s.type === 'path') return pathAt(s.keyframes ?? [], p, s.fovDeg, s.pathTiming)
  const c = s.bounds.center
  const d = shotDistance(s)
  const h = s.bounds.size.y
  const target = { x: c.x, y: c.y, z: c.z }

  switch (s.type) {
    case 'orbit':
      return pose(orbitPoint(c, d, s.headingDeg + s.sweepDeg * p, s.elevationDeg), target, s.fovDeg)

    case 'focus':
      return pose(orbitPoint(c, d, s.headingDeg + s.sweepDeg * p, s.elevationDeg), target, s.fovDeg)

    case 'reveal': {
      // Tight on the lower part of the model, easing out to the full view.
      const dist = lerp(d * 0.45, d * 1.05, p)
      const elev = lerp(s.elevationDeg * 0.4, s.elevationDeg + 14, p)
      const tgt = { x: c.x, y: lerp(c.y - h * 0.25, c.y, p), z: c.z }
      return pose(orbitPoint(tgt, dist, s.headingDeg + 25 * p, elev), tgt, s.fovDeg)
    }

    case 'crane': {
      const elev = lerp(4, s.elevationDeg, p)
      return pose(orbitPoint(c, d * lerp(0.9, 1.08, p), s.headingDeg + 12 * p, elev), target, s.fovDeg)
    }

    case 'topDown': {
      // Straight down onto the plan, then tilting toward a perspective.
      const elev = lerp(88, s.elevationDeg + 20, p)
      return pose(orbitPoint(c, d * lerp(1.1, 1, p), s.headingDeg + 30 * p, elev), target, s.fovDeg)
    }

    case 'dollyIn': {
      const dist = lerp(d * 1.5, d * 0.7, p)
      return pose(orbitPoint(c, dist, s.headingDeg, s.elevationDeg), target, s.fovDeg)
    }

    case 'flyby': {
      // Parallel to the front face, sliding from one side to the other.
      const front = orbitPoint(c, d * 0.9, s.headingDeg, s.elevationDeg)
      const side = rad(s.headingDeg + 90)
      const span = Math.max(s.bounds.size.x, s.bounds.size.z) * 0.6
      const off = lerp(-span, span, p)
      const position = { x: front.x + Math.sin(side) * off, y: front.y, z: front.z + Math.cos(side) * off }
      const tgt = { x: c.x + Math.sin(side) * off * 0.35, y: c.y, z: c.z + Math.cos(side) * off * 0.35 }
      return pose(position, tgt, s.fovDeg)
    }
  }
}

/**
 * Pose at progress p (0–1, already eased) along a keyframe path. Segments get
 * time in proportion to how far the eye travels (plus a floor so a pure
 * rotation still takes time); the eye follows a Catmull-Rom curve so it never
 * kinks at a stop, the target and fov interpolate with a smoothstep per segment.
 */
export function pathAt(keys: readonly CameraPose[], p: number, fallbackFov = DEFAULT_FOV_DEG, timing: 'distance' | 'even' = 'distance'): CameraPose {
  if (keys.length === 0) return pose({ x: 10, y: 10, z: 10 }, { x: 0, y: 0, z: 0 }, fallbackFov)
  if (keys.length === 1) return keys[0]
  const lens: number[] = []
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    const travel = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
    const turn = Math.hypot(b.target.x - a.target.x, b.target.y - a.target.y, b.target.z - a.target.z)
    lens.push(timing === 'even' ? 1 : travel + turn * 0.5 + 1e-3)
  }
  const total = lens.reduce((x, y) => x + y, 0)
  let at = clamp01(p) * total
  let i = 0
  while (i < lens.length - 1 && at > lens[i]) { at -= lens[i]; i++ }
  const u = clamp01(at / lens[i])
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)]
  const position = catmull(k0.position, k1.position, k2.position, k3.position, u)
  // Even timing is one continuous move: no easing at every keyframe.
  const s = timing === 'even' ? u : u * u * (3 - 2 * u)
  return {
    position,
    target: lerp3(k1.target, k2.target, s),
    fovDeg: lerp(k1.fovDeg, k2.fovDeg, s),
  }
}

function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t, t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) }
}

function lerp3(a: Vec3, b: Vec3, p: number): Vec3 {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z, b.z, p) }
}

/**
 * Keyframes for an exponential zoom: the eye moves along `dir` (unit, from the
 * target towards the eye) from `dStart` to `dEnd` metres away, the distances
 * spaced geometrically so that with 'even' path timing the apparent speed is
 * constant. The look-at point slides from `targetStart` to `targetEnd` on the
 * same geometric schedule.
 */
export function zoomKeyframes(
  targetStart: Vec3, targetEnd: Vec3, dir: Vec3, dStart: number, dEnd: number, fovDeg: number, n = 10,
): CameraPose[] {
  const a = Math.max(0.05, dStart), b = Math.max(0.05, dEnd)
  const keys: CameraPose[] = []
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 1 : i / (n - 1)
    const d = a * Math.pow(b / a, f)
    // How far along the zoom this is, in the same log space as the distance.
    const g = Math.abs(Math.log(b / a)) < 1e-6 ? f : Math.log(d / a) / Math.log(b / a)
    const t = lerp3(targetStart, targetEnd, g)
    keys.push({ position: { x: t.x + dir.x * d, y: t.y + dir.y * d, z: t.z + dir.z * d }, target: t, fovDeg })
  }
  return keys
}

/** Frame timestamps for rendering a shot at `fps` (last frame lands before the end). */
export function shotFrameTimes(s: ShotSpec, fps: number): number[] {
  const n = Math.max(1, Math.round(s.durationSec * fps))
  return Array.from({ length: n }, (_, i) => i / fps)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Point on a sphere around `c`: heading around Y, elevation above the horizon. */
export function orbitPoint(c: Vec3, distance: number, headingDeg: number, elevationDeg: number): Vec3 {
  const hd = rad(headingDeg)
  const el = rad(Math.max(-89, Math.min(89.5, elevationDeg)))
  const flat = Math.cos(el) * distance
  return {
    x: c.x + Math.sin(hd) * flat,
    y: c.y + Math.sin(el) * distance,
    z: c.z + Math.cos(hd) * flat,
  }
}

function pose(position: Vec3, target: Vec3, fovDeg: number): CameraPose {
  return { position, target, fovDeg }
}

/** How hard a speed ramp brakes in the middle (0 = none, <1). */
export const RAMP_DEPTH = 0.75

export function ease(kind: Easing, p: number): number {
  const x = clamp01(p)
  if (kind === 'linear') return x
  if (kind === 'easeOut') return 1 - Math.pow(1 - x, 3)
  if (kind === 'easeIn') return x * x * x
  // Speed 1+k at both ends, 1−k in the middle; monotonic for k < 1.
  if (kind === 'ramp') return x + (RAMP_DEPTH * Math.sin(2 * Math.PI * x)) / (2 * Math.PI)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}
