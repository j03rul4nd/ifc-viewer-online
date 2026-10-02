// ─── camera-framing ───────────────────────────────────────────────────────────
// WHAT A CAMERA PRESET SHOULD LOOK AT.
//
// The presets used to frame `currentModel.box` and nothing else. With one file
// that is right; with a federated set it frames a third of the building, with
// two buildings it ignores one, a scan next to the model is never in shot, and
// an empty scene flew to a made-up ±10 m box.
//
// The answer depends on a SCOPE:
//   active — the active model alone (the old behaviour, kept on purpose)
//   group  — every visible member of the active model's group
//   all    — everything visible: models and point clouds
//   auto   — `all`, unless the visible content is spread so far apart that one
//            shot of it shows nothing (two sites across a city). Then the
//            active group, and the result says so, so the UI can offer
//            "show everything" instead of pretending that was the request.
//
// PURE: boxes in, box out. No THREE, no store.

import type { CameraPreset } from '../types'

export type FramingScope = 'auto' | 'active' | 'group' | 'all'

export interface Vec3 { x: number; y: number; z: number }
export interface Box { min: Vec3; max: Vec3 }

export interface FramingItem {
  id: string
  kind: 'model' | 'cloud'
  /** Group of a model or cloud (scene-tree). A cloud with none joins only `all`. */
  groupId: string | null
  visible: boolean
  /** World-space AABB (pivot transform already applied). */
  box: Box
}

export interface FramingInput {
  items: ReadonlyArray<FramingItem>
  activeModelId: string | null
  scope: FramingScope
}

export interface FramingResult {
  box: Box
  /** The scope actually used — differs from the request when `auto` narrowed or a scope fell back. */
  scope: Exclude<FramingScope, 'auto'>
  itemIds: string[]
  /** True when `auto` narrowed to the active group because the scene is too spread out. */
  narrowed: boolean
}

/**
 * Past this diagonal the whole scene in one shot is a map, not a view: buildings
 * become specks. Chosen for "two sites in one city" rather than "a campus".
 */
export const SPREAD_LIMIT_M = 500

function union(boxes: ReadonlyArray<Box>): Box | null {
  let out: Box | null = null
  for (const b of boxes) {
    if (!isFiniteBox(b)) continue
    out = out
      ? {
          min: { x: Math.min(out.min.x, b.min.x), y: Math.min(out.min.y, b.min.y), z: Math.min(out.min.z, b.min.z) },
          max: { x: Math.max(out.max.x, b.max.x), y: Math.max(out.max.y, b.max.y), z: Math.max(out.max.z, b.max.z) },
        }
      : { min: { ...b.min }, max: { ...b.max } }
  }
  return out
}

function isFiniteBox(b: Box): boolean {
  const v = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]
  return v.every(Number.isFinite) && b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z
}

export function boxDiagonal(b: Box): number {
  return Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
}

function result(items: ReadonlyArray<FramingItem>, scope: FramingResult['scope'], narrowed = false): FramingResult | null {
  const box = union(items.map((i) => i.box))
  return box ? { box, scope, itemIds: items.map((i) => i.id), narrowed } : null
}

/**
 * Decide what to frame. Null only when there is nothing visible at all — the
 * caller disables the presets rather than inventing a box.
 */
export function resolveFraming({ items, activeModelId, scope }: FramingInput): FramingResult | null {
  const visible = items.filter((i) => i.visible && isFiniteBox(i.box))
  if (visible.length === 0) return null

  const active = visible.find((i) => i.kind === 'model' && i.id === activeModelId) ?? null
  const activeGroupId = active?.groupId ?? null
  const groupItems = active
    ? visible.filter((i) => i.id === active.id || (activeGroupId !== null && i.groupId === activeGroupId))
    : []

  // Each narrow scope falls back to the next wider one when it has nothing to
  // show (active model hidden, no model at all but a scan) — never to nothing.
  if (scope === 'active' && active) return result([active], 'active')
  if ((scope === 'active' || scope === 'group') && groupItems.length) return result(groupItems, 'group')

  const all = result(visible, 'all')
  if (scope !== 'auto' || !all) return all

  if (boxDiagonal(all.box) > SPREAD_LIMIT_M && groupItems.length && groupItems.length < visible.length) {
    return result(groupItems, 'group', true)
  }
  return all
}

/** Unit-free offset direction per preset, Y up. */
const DIRECTIONS: Record<CameraPreset, [number, number, number]> = {
  iso:    [1, 0.75, 1],
  top:    [0, 1, 0.0005],
  bottom: [0, -1, 0.0005],
  front:  [0, 0, 1],
  back:   [0, 0, -1],
  left:   [-1, 0, 0],
  right:  [1, 0, 0],
}

/**
 * Camera position + target for a preset looking at `box`.
 *
 * Distance comes from the bounding sphere and the vertical FOV, so a 3 m kiosk
 * and a 300 m campus both fill the frame — the old fixed multiplier of the
 * largest side over- or under-shot depending on proportions. `aspect` < 1
 * (portrait) widens the distance so the horizontal extent still fits.
 */
export function presetPose(box: Box, preset: CameraPreset, fovDeg = 45, aspect = 16 / 9): { position: Vec3; target: Vec3 } {
  const target = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  }
  const radius = Math.max(boxDiagonal(box) / 2, 2)
  const vHalf = ((fovDeg > 0 && fovDeg < 179 ? fovDeg : 45) * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * (aspect > 0 ? aspect : 1))
  // 1.2: breathing room — floating panels overlap the viewport edges.
  const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.2

  const [dx, dy, dz] = DIRECTIONS[preset]
  const len = Math.hypot(dx, dy, dz)
  return {
    target,
    position: {
      x: target.x + (dx / len) * dist,
      y: target.y + (dy / len) * dist,
      z: target.z + (dz / len) * dist,
    },
  }
}

// ── Tight framing ─────────────────────────────────────────────────────────────

/** Where to look FROM, as angles: azimuth from +x towards +z, elevation above the horizon. */
export interface FitView {
  /** Degrees. 45 is the iso corner (+x, +z). */
  azimuthDeg: number
  /** Degrees above the horizon; 90 looks straight down. */
  elevationDeg: number
}

/** The angles of each preset, for callers that want a preset with a tight fit. */
export const PRESET_VIEW: Record<CameraPreset, FitView> = {
  iso:    { azimuthDeg: 45,  elevationDeg: 28 },
  top:    { azimuthDeg: 90,  elevationDeg: 89.9 },
  bottom: { azimuthDeg: 90,  elevationDeg: -89.9 },
  front:  { azimuthDeg: 90,  elevationDeg: 0 },
  back:   { azimuthDeg: -90, elevationDeg: 0 },
  left:   { azimuthDeg: 180, elevationDeg: 0 },
  right:  { azimuthDeg: 0,   elevationDeg: 0 },
}

/** Clamp a fill ratio to something a frame can show. */
export function clampFill(fill: number | undefined): number {
  if (typeof fill !== 'number' || !Number.isFinite(fill)) return 0.85
  return Math.min(0.98, Math.max(0.2, fill))
}

/**
 * Camera pose that makes `box` fill `fill` of the frame from the given angles.
 *
 * presetPose fits the bounding SPHERE: right for "never clip anything", and a
 * long low building ends up a sliver in the middle of a 16:9 frame, which is
 * what an article or a cover cannot afford. This projects the eight corners
 * into the view and solves, per corner, the distance at which it touches the
 * edge of the frame scaled by `fill`; the largest of those is the shot. The
 * target is the box centre, so the result is symmetric for a symmetric view.
 */
export function fitPose(
  box: Box,
  view: FitView,
  fovDeg = 45,
  aspect = 16 / 9,
  fill = 0.85,
): { position: Vec3; target: Vec3 } {
  const target = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  }
  const az = (view.azimuthDeg * Math.PI) / 180
  const el = (Math.max(-89.9, Math.min(89.9, view.elevationDeg)) * Math.PI) / 180
  // Unit vector from the target towards the camera.
  const back = { x: Math.cos(el) * Math.cos(az), y: Math.sin(el), z: Math.cos(el) * Math.sin(az) }
  // Camera basis: right = up × back, up' = back × right (world up = +y).
  let right = { x: back.z, y: 0, z: -back.x }
  const rl = Math.hypot(right.x, right.z)
  right = rl > 1e-9 ? { x: right.x / rl, y: 0, z: right.z / rl } : { x: 1, y: 0, z: 0 }
  const up = {
    x: back.y * right.z - back.z * right.y,
    y: back.z * right.x - back.x * right.z,
    z: back.x * right.y - back.y * right.x,
  }

  const f = clampFill(fill)
  const vHalf = ((fovDeg > 0 && fovDeg < 179 ? fovDeg : 45) * Math.PI) / 360
  const tanV = Math.tan(vHalf) * f
  const tanH = Math.tan(vHalf) * (aspect > 0 ? aspect : 1) * f

  let dist = 0
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const d = { x: x - target.x, y: y - target.y, z: z - target.z }
    const cx = d.x * right.x + d.y * right.y + d.z * right.z
    const cy = d.x * up.x + d.y * up.y + d.z * up.z
    const toward = d.x * back.x + d.y * back.y + d.z * back.z
    // The corner sits at depth (dist − toward) in front of the camera.
    dist = Math.max(dist, toward + Math.abs(cx) / tanH, toward + Math.abs(cy) / tanV)
  }
  // A degenerate box (a point) still needs somewhere to stand.
  dist = Math.max(dist, 2)
  return {
    target,
    position: { x: target.x + back.x * dist, y: target.y + back.y * dist, z: target.z + back.z * dist },
  }
}
