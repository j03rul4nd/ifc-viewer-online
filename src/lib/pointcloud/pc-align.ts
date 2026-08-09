// ─── pc-align ─────────────────────────────────────────────────────────────────
// The alignment ladder: IFC coordinate system ↔ point cloud coordinate system,
// resolved into ONE scene transform. This is the heart of the feature — see
// docs/POINT_CLOUD_PLAN.md §3 for the derivation and the rung table.
//
// Two rules govern everything here:
//
//   • THE MODEL NEVER MOVES. Exactly the invariant map mode obeys (INV-2). The
//     cloud is transformed into the IFC's frame, never the reverse, so nothing
//     downstream of the IFC (validation, BCF viewpoints, measurements, tours)
//     can be invalidated by loading a scan.
//
//   • A GUESS IS LABELLED AS A GUESS. Every rung records i18n reason keys, and
//     the two speculative rungs ('local', 'manual') are surfaced as such in the
//     UI. Silently landing a cloud in the wrong place looks like success and is
//     the worst outcome available.
//
// Pure module: proj4 (through crs.ts) and plain math only — no three.js.

import { resolveCrs, gridToGrid, gridToWgs84, normalizeEpsgCode, type CrsDef } from '../geo/crs'
import { WGS84_RADIUS } from '../geo/geo-math'
import type { GeorefExtraction, GeoPlacement } from '../geo/geo-types'
import {
  NO_OFFSET, clampOffset,
  type AlignmentOffset, type PointCloudAlignment, type SourceFrame, type UpAxis, type Vec3,
} from './pc-types'

const DEG = Math.PI / 180

/** Shape of viewer.getModelBounds() — structural, so this module imports no viewer. */
export interface ModelBoundsLike {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

export interface AlignInput {
  /** The cloud's own frame, straight from the reader. */
  frame: SourceFrame
  /** IFC georeferencing extraction for the model we are aligning against. */
  georef: GeorefExtraction | null
  /** Resolved IFC placement (lat/lon anchor), when map mode / solar resolved one. */
  placement: GeoPlacement | null
  /** Scene-space bounds of the IFC model. */
  modelBounds: ModelBoundsLike | null
}

// ── Public entry point ─────────────────────────────────────────────────────────

/**
 * Walk the ladder top-down and return the first rung whose preconditions hold.
 * Never throws: the bottom rung ('manual') always applies.
 */
export function alignCloud(input: AlignInput): PointCloudAlignment {
  const alignment =
    tryMapConversion(input) ??
    tryGeographic(input) ??
    tryLocal(input) ??
    manualFallback(input)

  // A scan that DOES declare a CRS we simply cannot resolve is a fixable
  // problem, not an absent one: the user can paste a proj4 definition and get
  // the top rungs back. Falling through to "placed by hand" without saying why
  // hides that, so the reason is attached wherever the ladder ended up.
  if (unresolvedCloudCrs(input.frame) && alignment.rung !== 'map-conversion' && alignment.rung !== 'shared-crs') {
    alignment.reasons = [...alignment.reasons, 'align.reason.cloudCrsUnknown']
  }
  return alignment
}

/**
 * True when the file names a coordinate system this build has no definition for.
 * Distinct from "no CRS at all" — that one is not actionable.
 */
export function unresolvedCloudCrs(frame: SourceFrame): boolean {
  if (!frame.epsgCode) return false
  const code = normalizeEpsgCode(frame.epsgCode)
  if (!code) return true
  return !resolveCrs(code).ok
}

// ── Rung 1/2 — grid coordinates on both sides ──────────────────────────────────

function tryMapConversion(input: AlignInput): PointCloudAlignment | null {
  const { frame, georef } = input
  if (!georef || georef.eastings === null || georef.northings === null) return null
  if (!frame.epsgCode) return null

  const cloudCode = normalizeEpsgCode(frame.epsgCode)
  if (!cloudCode) return null
  const cloudCrs = resolveCrs(cloudCode)
  if (!cloudCrs.ok) return null

  const reasons: string[] = []
  const ifcCode = normalizeEpsgCode(georef.epsgCode)

  // Where does the IFC declare its own grid? Three cases, three confidences.
  let ifcCrs: CrsDef | null = null
  let sameCrs = false
  if (ifcCode) {
    const r = resolveCrs(ifcCode)
    if (r.ok) { ifcCrs = r.value; sameCrs = ifcCode === cloudCode }
    else reasons.push('align.reason.ifcCrsUnknown')
  }

  const u = frame.unitScale
  const s = georef.scale && georef.scale !== 0 ? georef.scale : 1
  const gamma = georef.rotationDeg * DEG

  // Cloud origin, expressed in the IFC's grid, in metres.
  const oE = frame.origin.x * u
  const oN = frame.origin.y * u
  const oH = frame.origin.z * u

  let gridE = oE
  let gridN = oN
  /** Extra plan rotation caused by the two grids not being parallel. */
  let beta = 0

  if (ifcCrs && !sameCrs) {
    const conv = gridToGrid(cloudCrs.value, ifcCrs, oE, oN)
    if (!conv.ok) return null
    gridE = conv.value.eastings
    gridN = conv.value.northings
    beta = gridBearingDelta(cloudCrs.value, ifcCrs, oE, oN)
    reasons.push('align.reason.reprojected')
  } else if (!ifcCrs) {
    // The IFC gave grid coordinates but never said which grid. Assuming the
    // cloud's is the same one is the only workable reading — say so out loud.
    reasons.push('align.reason.assumedSameCrs')
  } else {
    reasons.push('align.reason.sameCrs')
  }

  const dE = gridE - georef.eastings
  const dN = gridN - georef.northings
  const cos = Math.cos(gamma), sin = Math.sin(gamma)

  // Invert the MapConversion: project = R(−γ)·(grid − origin) / s.
  const xP = (dE * cos + dN * sin) / s
  const yP = (-dE * sin + dN * cos) / s
  const heightM = georef.heightM ?? 0
  if (georef.heightM === null) reasons.push('align.reason.noElevationDatum')
  const zP = (oH - heightM) / s

  const exact = sameCrs && georef.heightM !== null && georef.status === 'found'

  return {
    rung: ifcCrs && sameCrs ? 'map-conversion' : 'shared-crs',
    confidence: exact ? 'exact' : 'high',
    // Project → scene: x = xP, y = zP, z = −yP (repo convention, geo-math header).
    origin: { x: xP, y: zP, z: -yP },
    // ψ = the plan rotation source→project. See the plan §3 for the derivation.
    yawRad: -(gamma + beta),
    scale: u / s,
    upAxis: frame.upAxis,
    reasons,
    offset: { ...NO_OFFSET },
  }
}

/**
 * Angle between "north in grid A" and "north in grid B" at a point, in radians.
 * Two projected CRSs are almost never parallel — ignoring this puts a 1 km scan
 * up to a couple of metres out of true at the far end.
 */
export function gridBearingDelta(from: CrsDef, to: CrsDef, e: number, n: number): number {
  const step = 1000
  const a = gridToGrid(from, to, e, n)
  const b = gridToGrid(from, to, e, n + step)
  if (!a.ok || !b.ok) return 0
  const dE = b.value.eastings - a.value.eastings
  const dN = b.value.northings - a.value.northings
  if (dE === 0 && dN === 0) return 0
  // atan2(east, north) — the bearing of the source's north axis in the target grid.
  return Math.atan2(dE, dN)
}

// ── Rung 3 — geographic anchor only ────────────────────────────────────────────

function tryGeographic(input: AlignInput): PointCloudAlignment | null {
  const { frame, placement, modelBounds } = input
  if (!placement || !frame.epsgCode) return null

  const cloudCode = normalizeEpsgCode(frame.epsgCode)
  if (!cloudCode) return null
  const cloudCrs = resolveCrs(cloudCode)
  if (!cloudCrs.ok) return null

  const u = frame.unitScale
  // Cloud origin → WGS84, then a local tangent-plane offset from the IFC anchor.
  const ll = gridPointToLatLon(cloudCrs.value, frame.origin.x * u, frame.origin.y * u)
  if (!ll) return null

  const { east, north } = enuOffset(placement.lat, placement.lon, ll.lat, ll.lon)
  const gamma = placement.rotationDeg * DEG
  const cos = Math.cos(gamma), sin = Math.sin(gamma)
  // True-north frame → project plan: R(−γ).
  const xP = east * cos + north * sin
  const yP = -east * sin + north * cos

  const anchorX = modelBounds?.center.x ?? 0
  const anchorZ = modelBounds?.center.z ?? 0
  const modelMinY = modelBounds ? modelBounds.center.y - modelBounds.size.y / 2 : 0

  // No shared elevation datum: land the cloud's own floor on the model's floor
  // and say so. Guessing an orthometric offset would be worse than admitting it.
  const cloudHeightSpan = (frame.max.z - frame.min.z) * u
  const originAboveFloor = (frame.origin.z - frame.min.z) * u
  const y = modelMinY + originAboveFloor - placement.heightOffsetM

  return {
    rung: 'geographic',
    confidence: 'approximate',
    origin: { x: anchorX + xP, y, z: anchorZ - yP },
    yawRad: -gamma,
    scale: u,
    upAxis: frame.upAxis,
    reasons: [
      'align.reason.geographicAnchor',
      ...(cloudHeightSpan > 0 ? ['align.reason.groundMatched'] : []),
    ],
    offset: { ...NO_OFFSET },
  }
}

function gridPointToLatLon(def: CrsDef, e: number, n: number): { lat: number; lon: number } | null {
  const r = gridToWgs84(def, e, n)
  return r.ok ? { lat: r.value.lat, lon: r.value.lon } : null
}

/** Local east/north offset in metres from (lat0, lon0) to (lat, lon). */
export function enuOffset(
  lat0: number, lon0: number, lat: number, lon: number,
): { east: number; north: number } {
  const phi = lat0 * DEG
  return {
    east: (lon - lon0) * DEG * WGS84_RADIUS * Math.cos(phi),
    north: (lat - lat0) * DEG * WGS84_RADIUS,
  }
}

// ── Rung 4 — plausibly the same local frame ────────────────────────────────────

/**
 * How far the cloud may sit from the model, as a multiple of the model's
 * diagonal, before "they're in the same local frame" stops being credible.
 */
const LOCAL_DISTANCE_FACTOR = 3
/** Extent ratio window inside which the two are plausibly the same site. */
const LOCAL_EXTENT_MIN = 0.05
const LOCAL_EXTENT_MAX = 20

function tryLocal(input: AlignInput): PointCloudAlignment | null {
  const { frame, modelBounds } = input
  if (!modelBounds) return null

  const u = guessUnitScale(frame, modelBounds)
  const reasons: string[] = []
  if (u !== frame.unitScale) reasons.push(unitReasonKey(u))

  // Identity placement: source (x,y,z) × u → scene (x·u, z·u, −y·u).
  const origin: Vec3 = { x: frame.origin.x * u, y: frame.origin.z * u, z: -frame.origin.y * u }

  const modelDiag = Math.hypot(modelBounds.size.x, modelBounds.size.y, modelBounds.size.z)
  const cloudDiag = Math.hypot(
    (frame.max.x - frame.min.x) * u,
    (frame.max.y - frame.min.y) * u,
    (frame.max.z - frame.min.z) * u,
  )
  if (modelDiag <= 0 || cloudDiag <= 0) return null

  const distance = Math.hypot(
    origin.x - modelBounds.center.x,
    origin.y - modelBounds.center.y,
    origin.z - modelBounds.center.z,
  )
  const extentRatio = cloudDiag / modelDiag

  const plausible =
    distance <= LOCAL_DISTANCE_FACTOR * modelDiag &&
    extentRatio >= LOCAL_EXTENT_MIN && extentRatio <= LOCAL_EXTENT_MAX
  if (!plausible) return null

  reasons.push('align.reason.sharedLocalFrame')
  return {
    rung: 'local',
    confidence: 'high',
    origin,
    yawRad: 0,
    scale: u,
    upAxis: frame.upAxis,
    reasons,
    offset: { ...NO_OFFSET },
  }
}

/**
 * A cloud with no declared unit whose extent is ~1000× (or ~1/0.3048×) the
 * model's is almost certainly in millimetres (or feet). Only applied when the
 * ratio is unambiguous — a wrong unit guess is far more damaging than none.
 */
export function guessUnitScale(frame: SourceFrame, modelBounds: ModelBoundsLike): number {
  if (frame.unitSource !== 'assumed') return frame.unitScale
  const cloudDiag = Math.hypot(frame.max.x - frame.min.x, frame.max.y - frame.min.y, frame.max.z - frame.min.z)
  const modelDiag = Math.hypot(modelBounds.size.x, modelBounds.size.y, modelBounds.size.z)
  if (cloudDiag <= 0 || modelDiag <= 0) return frame.unitScale

  const ratio = cloudDiag / modelDiag
  if (ratio > 300 && ratio < 3000) return 0.001            // millimetres
  if (ratio > 30 && ratio < 300) return 0.01               // centimetres
  if (ratio > 2.5 && ratio < 4.5) return 0.3048            // feet
  return frame.unitScale
}

function unitReasonKey(unitScale: number): string {
  if (unitScale === 0.001) return 'align.reason.unitMillimetres'
  if (unitScale === 0.01) return 'align.reason.unitCentimetres'
  if (unitScale === 0.3048) return 'align.reason.unitFeet'
  return 'align.reason.unitAssumed'
}

// ── Rung 5 — nothing known ─────────────────────────────────────────────────────

function manualFallback(input: AlignInput): PointCloudAlignment {
  const { frame, modelBounds } = input
  const u = modelBounds ? guessUnitScale(frame, modelBounds) : frame.unitScale
  // Cloud bbox centre onto the model's plan centre, cloud floor onto model floor.
  const halfHeight = ((frame.max.z - frame.min.z) / 2) * u
  const modelMinY = modelBounds ? modelBounds.center.y - modelBounds.size.y / 2 : 0

  return {
    rung: 'manual',
    confidence: 'manual',
    origin: {
      x: modelBounds?.center.x ?? 0,
      y: modelMinY + halfHeight,
      z: modelBounds?.center.z ?? 0,
    },
    yawRad: 0,
    scale: u,
    upAxis: frame.upAxis,
    reasons: ['align.reason.noCommonReference'],
    offset: { ...NO_OFFSET },
  }
}

// ── Offset persistence (mirrors geo/placement.ts savePlacement) ────────────────
//
// A manual placement is work: the user dragged five sliders until a scan lined
// up with a wall. Losing it on reload would make the honest "we had to guess"
// rungs feel worse than a silent wrong answer. Persisted per FILE (not per
// session), device-local, zero network — same shape and same reasoning as the
// map's per-file placement.

const LS_PREFIX = 'ifc-pc-offset:v1:'
const LS_PROJ4 = 'ifc-pc-proj4:v1:'
const LS_UPAXIS = 'ifc-pc-upaxis:v1:'

/**
 * Which way is up, when the user had to tell us.
 *
 * Kept apart from the offset because it is not a nudge — it is a correction to
 * something the file failed to state and we guessed. Persisting it per file
 * means correcting a scan once is enough; without this, every reopen of a Y-up
 * PLY would land it on its side again and the user would learn that the control
 * does not stick, which is worse than not having it.
 */
export function saveCloudUpAxis(fileKey: string, axis: UpAxis): void {
  try { localStorage.setItem(LS_UPAXIS + fileKey, JSON.stringify({ v: 1, axis })) }
  catch { /* quota / private mode */ }
}

export function loadCloudUpAxis(fileKey: string): UpAxis | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_UPAXIS + fileKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { v?: number; axis?: unknown }
    if (parsed.v !== 1) return null
    return parsed.axis === 'y' || parsed.axis === 'z' ? parsed.axis : null
  } catch { return null }
}

export function clearCloudUpAxis(fileKey: string): void {
  try { localStorage.removeItem(LS_UPAXIS + fileKey) } catch { /* ignore */ }
}

/**
 * A proj4 definition the user supplied for a CRS this build cannot resolve,
 * kept per file so the scan re-opens correctly instead of dropping back to
 * "placed by hand". Mirrors PersistedPlacement.customProj4 in geo/placement.ts.
 */
export function saveCloudProj4(fileKey: string, code: string, def: string): void {
  try { localStorage.setItem(LS_PROJ4 + fileKey, JSON.stringify({ v: 1, code, def })) }
  catch { /* quota / private mode */ }
}

export function loadCloudProj4(fileKey: string): { code: string; def: string } | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_PROJ4 + fileKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { v?: number; code?: unknown; def?: unknown }
    if (parsed.v !== 1 || typeof parsed.code !== 'string' || typeof parsed.def !== 'string') return null
    return { code: parsed.code, def: parsed.def }
  } catch { return null }
}

/** Stable identity for a cloud file. Same fields buildCacheKey uses for IFCs. */
export function cloudFileKey(
  file: { name: string; size: number; lastModified: number },
  sourceUrl?: string | null,
): string {
  // A downloaded scan is identified by where it came from, never by the File
  // wrapper around it: that wrapper's lastModified is the instant of the fetch,
  // so it differs on every load and nothing keyed by it ever persists.
  if (sourceUrl) return `url:${sourceUrl}`
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** An offset equal to identity is the absence of a placement — drop the entry. */
function isIdentity(o: AlignmentOffset): boolean {
  return o.x === 0 && o.y === 0 && o.z === 0 && o.yawDeg === 0 && o.scaleMul === 1
}

export function saveOffset(fileKey: string, offset: AlignmentOffset): void {
  try {
    if (isIdentity(offset)) localStorage.removeItem(LS_PREFIX + fileKey)
    else localStorage.setItem(LS_PREFIX + fileKey, JSON.stringify({ v: 1, offset, savedAt: Date.now() }))
  } catch { /* quota / private mode — a lost nudge must never break loading */ }
}

/** Returns null when nothing was saved or the entry no longer parses. */
export function loadOffset(fileKey: string): AlignmentOffset | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_PREFIX + fileKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const env = parsed as { v?: number; offset?: unknown }
    if (env.v !== 1 || !env.offset || typeof env.offset !== 'object') return null
    return clampOffset(env.offset as Partial<AlignmentOffset>)
  } catch {
    return null
  }
}

export function clearOffset(fileKey: string): void {
  try { localStorage.removeItem(LS_PREFIX + fileKey) } catch { /* ignore */ }
}

// ── Offset application ─────────────────────────────────────────────────────────

/** The effective transform after the user's manual nudge. */
export interface EffectiveTransform {
  position: Vec3
  yawRad: number
  /**
   * User levelling, radians. Applied in SCENE axes, on top of the structural
   * tilt below — so once the up-axis is right, these behave the way a person
   * expects: pitch tips the far edge up, roll drops one side.
   */
  pitchRad: number
  rollRad: number
  /** Fixed tilt laying a Z-up source onto the Y-up scene. 0 for a Y-up source. */
  tiltRad: number
  scale: number
}

export function effectiveTransform(a: PointCloudAlignment): EffectiveTransform {
  const o = a.offset ?? NO_OFFSET
  return {
    position: { x: a.origin.x + o.x, y: a.origin.y + o.y, z: a.origin.z + o.z },
    yawRad: a.yawRad + o.yawDeg * DEG,
    pitchRad: (o.pitchDeg || 0) * DEG,
    rollRad: (o.rollDeg || 0) * DEG,
    tiltRad: a.upAxis === 'z' ? -Math.PI / 2 : 0,
    scale: a.scale * (o.scaleMul || 1),
  }
}
