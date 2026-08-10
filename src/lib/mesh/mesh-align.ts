// ─── mesh-align ───────────────────────────────────────────────────────────────
// Where an imported mesh lands, and in what units. Pure arithmetic on plain
// boxes — no three.js — so the awkward parts are testable directly.
//
// This is a deliberately SHORTER ladder than the point cloud's. A scan can carry
// a coordinate reference system and a map conversion, and pc-align climbs five
// rungs looking for one. A GLB or an OBJ carries neither, ever: the formats have
// nowhere to put them. So there are exactly two questions — what unit is this,
// and which way is up — and then the user places it.
//
// Being honest about that is the point. Offering a mesh import a "georeferenced"
// badge it can never earn would make the badge meaningless everywhere else.

import { clampOffset, NO_OFFSET } from '../pointcloud/pc-types'
import type { AlignmentOffset, MeshFrame, MeshFormat, UpAxis } from './mesh-types'

export interface Box {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

const size = (b: Box): { x: number; y: number; z: number } => ({
  x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z,
})

/**
 * Guess the source unit from how big the thing is.
 *
 * Exporters disagree and almost none of them record it. Blender writes metres,
 * a lot of CAD writes millimetres, and some pipelines write centimetres — and a
 * 12-metre building arriving as a 12 000-unit object is indistinguishable from a
 * 12 km one except by plausibility.
 *
 * So plausibility is what is used, against the range of things that get imported
 * into a building scene: furniture, a scanned room, a site, a whole block. Under
 * a quarter of a metre or over a kilometre, nothing being imported is that size
 * in metres, and the alternative reading is.
 */
export function inferUnitScale(box: Box): { scale: number; reason: string | null } {
  const s = size(box)
  const largest = Math.max(s.x, s.y, s.z)
  if (!Number.isFinite(largest) || largest <= 0) return { scale: 1, reason: null }

  if (largest > 5_000) return { scale: 0.001, reason: 'reason.unitMillimetres' }
  if (largest > 500) return { scale: 0.01, reason: 'reason.unitCentimetres' }
  // Everything between a quarter of a metre and half a kilometre reads as metres,
  // which covers a chair through to a city block.
  return { scale: 1, reason: null }
}

/**
 * Which axis the source treats as up.
 *
 * glTF SETTLES this: the specification requires Y-up, so a .glb or .gltf is
 * declared and there is nothing to guess. OBJ has no convention — DCC tools
 * write Y-up, CAD writes Z-up — so it gets the same shape heuristic the point
 * cloud readers use, and the same admission that it is a guess.
 */
export function inferUpAxis(
  format: MeshFormat, box: Box,
): { axis: UpAxis; source: 'declared' | 'assumed' } {
  if (format === 'glb' || format === 'gltf') return { axis: 'y', source: 'declared' }

  const s = size(box)
  const largest = Math.max(s.x, s.y, s.z)
  if (!(largest > 0)) return { axis: 'y', source: 'assumed' }

  // Same rule as Bounds.inferUpAxis: what people model is wider than it is tall,
  // so the shortest axis is the vertical one — and a near-cubic object carries
  // no signal, in which case OBJ's more common convention is the safer default.
  const MARGIN = 1.35
  if (s.y * MARGIN < Math.min(s.x, s.z) && s.y < s.z) return { axis: 'y', source: 'assumed' }
  if (s.z * MARGIN < Math.min(s.x, s.y) && s.z < s.y) return { axis: 'z', source: 'assumed' }
  return { axis: 'y', source: 'assumed' }
}

export interface FitInput {
  frame: MeshFrame
  /** Scene-space bounds of the IFC model, or null when nothing is loaded. */
  modelBounds: {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
}

/**
 * The starting placement: centred on the model in plan, sitting on its floor.
 *
 * Not an alignment and never presented as one — there is nothing in either file
 * to align BY. It exists so the mesh arrives somewhere the user can see it and
 * grab it, rather than at the world origin a kilometre away, which is what
 * "imported successfully" looks like when nobody chose a position.
 */
export function initialPlacement(input: FitInput): AlignmentOffset {
  const { frame, modelBounds } = input
  if (!modelBounds) return { ...NO_OFFSET }

  // Source-space centre, converted to scene metres. The system applies the
  // up-axis tilt itself, so plan-centring is done on the two horizontal axes as
  // the SOURCE sees them.
  const unit = frame.unitScale
  const cx = ((frame.min.x + frame.max.x) / 2) * unit
  const horizontalSecond = frame.upAxis === 'z' ? 'y' : 'z'
  const cSecond = ((frame.min[horizontalSecond] + frame.max[horizontalSecond]) / 2) * unit

  // After the tilt, source X is scene X and the other horizontal is scene −Z.
  const sceneX = cx
  const sceneZ = frame.upAxis === 'z' ? -cSecond : cSecond

  // Drop the object's own bottom onto the model's floor rather than its centre
  // onto the model's centre — a chair placed by its middle is half in the slab.
  const upKey = frame.upAxis === 'z' ? 'z' : 'y'
  const bottom = frame.min[upKey] * unit
  const floorY = modelBounds.center.y - modelBounds.size.y / 2

  return clampOffset({
    x: modelBounds.center.x - sceneX,
    y: floorY - bottom,
    z: modelBounds.center.z - sceneZ,
  })
}

// ── Persistence ────────────────────────────────────────────────────────────────
//
// Mirrors pc-align's per-file storage exactly, including the reasoning: placing
// an imported model is work, and losing it on reload teaches people not to
// bother doing it carefully.

const LS_PLACEMENT = 'ifc-mesh-placement:v1:'
const LS_UPAXIS = 'ifc-mesh-upaxis:v1:'
const LS_UNIT = 'ifc-mesh-unit:v1:'

/** name:size:mtime, or the URL when the bytes were fetched. See cloudFileKey. */
export function meshFileKey(
  file: { name: string; size: number; lastModified: number },
  sourceUrl?: string | null,
): string {
  if (sourceUrl) return `url:${sourceUrl}`
  return `${file.name}:${file.size}:${file.lastModified}`
}

function isIdentity(o: AlignmentOffset): boolean {
  return o.x === 0 && o.y === 0 && o.z === 0
    && o.yawDeg === 0 && o.pitchDeg === 0 && o.rollDeg === 0 && o.scaleMul === 1
}

export function savePlacement(fileKey: string, placement: AlignmentOffset): void {
  try {
    if (isIdentity(placement)) localStorage.removeItem(LS_PLACEMENT + fileKey)
    else localStorage.setItem(LS_PLACEMENT + fileKey, JSON.stringify({ v: 1, placement }))
  } catch { /* quota / private mode */ }
}

export function loadPlacement(fileKey: string): AlignmentOffset | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_PLACEMENT + fileKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { v?: number; placement?: unknown }
    if (parsed.v !== 1 || !parsed.placement || typeof parsed.placement !== 'object') return null
    return clampOffset(parsed.placement as Partial<AlignmentOffset>)
  } catch { return null }
}

export function clearPlacement(fileKey: string): void {
  try { localStorage.removeItem(LS_PLACEMENT + fileKey) } catch { /* ignore */ }
}

export function saveMeshUpAxis(fileKey: string, axis: UpAxis): void {
  try { localStorage.setItem(LS_UPAXIS + fileKey, JSON.stringify({ v: 1, axis })) }
  catch { /* ignore */ }
}

export function loadMeshUpAxis(fileKey: string): UpAxis | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_UPAXIS + fileKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { v?: number; axis?: unknown }
    if (parsed.v !== 1) return null
    return parsed.axis === 'y' || parsed.axis === 'z' ? parsed.axis : null
  } catch { return null }
}

export function saveMeshUnit(fileKey: string, unitScale: number): void {
  try { localStorage.setItem(LS_UNIT + fileKey, JSON.stringify({ v: 1, unitScale })) }
  catch { /* ignore */ }
}

export function loadMeshUnit(fileKey: string): number | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_UNIT + fileKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { v?: number; unitScale?: unknown }
    if (parsed.v !== 1 || typeof parsed.unitScale !== 'number') return null
    // A unit outside this range is corrupt, not a preference — applying it would
    // put the object somewhere no control can bring it back from.
    const u = parsed.unitScale
    return Number.isFinite(u) && u >= 1e-6 && u <= 1e6 ? u : null
  } catch { return null }
}
