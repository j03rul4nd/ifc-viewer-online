// ─── screen-labels ────────────────────────────────────────────────────────────
// Place names drawn the way Mapbox draws them: upright, at a constant size on
// screen, collision-resolved across the WHOLE view, fading in and out.
//
// Until now every label was painted into the ground textures. That is right
// for street names (they belong along the street), but for a city, a
// neighbourhood or a POI it meant text lying flat in perspective, shrinking
// with distance and breathing ×0.7–×1.4 every time a tile swapped for its
// children — and two tiles could each place the same name.
//
// Why sprites in the 3D scene and not an HTML overlay: an overlay is invisible
// to every capture path (PNG, GIF, captureStream video). Sprites with
// sizeAttenuation:false are rendered by the same renderer, so the names are in
// the screenshot, the clip and the social export.
//
// Data flow: the vector painter hands this layer the point-label candidates of
// each region it paints (in normalized mercator coords); the layer keeps them
// per region and, each frame, uses only the regions the tile engine is
// currently DISPLAYING — so a name from a cached tile of another zoom never
// shows up.

import * as THREE from 'three'
import type { LabelLayer, Props } from './map-styles'

export interface ScreenLabelCandidate {
  /** Stable identity across regions and zooms (same place = same key). */
  key: string
  text: string
  /** Normalized mercator, y north (the tiling's frame). */
  nx: number
  ny: number
  priority: number
  /** Authored CSS px (before any texel scale). */
  cssSize: number
  layer: LabelLayer
  props: Props
}

export interface ScreenLabelLayer {
  /**
   * Add at the SCENE ROOT, never under the basemap group: the sprite shader
   * multiplies by its parent's scale, and the basemap's is the Earth in metres.
   */
  readonly group: THREE.Group
  setRegion(regionKey: string, cands: ScreenLabelCandidate[]): void
  removeRegion(regionKey: string): void
  /**
   * Per frame. `visibleRegions` = keys the tile engine is displaying now;
   * `tileFrame` = the tiles' world matrix (normalized −0.5…0.5 → world).
   */
  update(
    camera: THREE.Camera, viewport: { width: number; height: number },
    visibleRegions: ReadonlySet<string>, dpr: number, tileFrame: THREE.Matrix4,
    /** World boxes no name may be drawn over: the models the map is there for. */
    keepOut?: readonly THREE.Box3[],
  ): void
  dispose(): void
  /** Dev diagnosis: what the layer holds right now. */
  debug(visibleRegions?: ReadonlySet<string>): {
    regions: number; candidates: number; entries: number; visibleMatched: number; sampleRegion?: string
    /** Keys placed in the last still frame, and the distance limit then (m). */
    placed: string[]; horizonM: number; beyondHorizon: number
    /** performance.now() of that placement. */
    placedAt: number
    /** Screen hulls of the keep-out boxes and the placed names' boxes, CSS px. */
    blocked: ScreenPoint[][]; placedBoxes: Array<{ key: string; box: ScreenBox; distM: number }>
  }
}

/** Most names on screen at once — a map, not a list. */
const MAX_VISIBLE = 90
/**
 * Most names per layer on one screen. The per-tile budgets kept a single tile
 * sparse, but a 3D view shows dozens of tiles at once — measured on Poblenou:
 * 32 names, mostly bus stops. A map names a few places well.
 */
const SCREEN_QUOTA: Readonly<Record<string, number>> = {
  place: 18, poi: 12, 'water-name': 6, housenumber: 24,
}
/** Priority added to a POI at the bottom of the screen (nearest the viewer). */
const NEAR_BONUS = 40
/** Fade speed (opacity per second): in gently, out of the way fast. */
const FADE_IN_PER_S = 5
const FADE_OUT_PER_S = 9
/**
 * Clear space around a name, CSS px. It was 4: two names 8 px apart read as
 * one line of text, and in a pitched view the far half of the screen filled
 * edge to edge.
 */
const PAD_PX = 9
/** The same words are not written twice closer than this on screen, CSS px. */
const SAME_TEXT_PX = 260
/**
 * A name further from the eye than this many times the camera–focus distance
 * is not placed. In a low pitched view the far half of the screen is the
 * horizon: "Rubí", "Terrassa", "Sabadell" floated over it, 15–20 km away,
 * pinned to points nobody was looking at. 3 keeps every name up to 2.7 km in
 * the bench's low view (docs/GIS_MAP_MODE.md, "Names, second pass").
 */
export const HORIZON_FACTOR = 3
let horizonFactor = HORIZON_FACTOR
/** Dev: try another factor live (the WP5 check measures several). */
export function setLabelHorizonFactor(n: number): void { horizonFactor = n > 0 ? n : HORIZON_FACTOR }
/**
 * Looking at (or above) the horizon there is no focus on the ground; the
 * focus is taken where a ray this many radians below the horizontal meets it
 * (≈ 19 × the camera's height), so the limit stays finite.
 */
const MIN_FOCUS_PITCH_RAD = (3 * Math.PI) / 180
/**
 * Priority a name that was on screen the frame before keeps over newcomers.
 * Without it every frame was placed from scratch and a name that slid 1 px
 * could lose its spot to a neighbour of about the same rank: blinking at
 * rest. 120 is above the step between two place ranks (town 700 → city 800
 * is 100) so a kept name holds against its peers, not against a whole class
 * above (a kept village, 600, still yields to a new city, 800).
 */
export const KEEP_BONUS = 120
let keepBonus = KEEP_BONUS
/** Dev: 0 turns the hysteresis off (the WP5 check compares both). */
export function setLabelKeepBonus(n: number): void { keepBonus = n >= 0 ? n : KEEP_BONUS }

// -- While the camera moves ---------------------------------------------------
// A name is pinned to a place and drawn at a fixed size, so in a moving view
// every one of them slides across the picture at its own speed, and the
// placement (who wins each collision) changes under them frame by frame:
// names blink in and out along the way. Nobody reads a map while flying over
// it. So while the camera moves the minor names leave, the places stay as a
// faint hint of where things are, nothing is re-placed, and the full set
// returns once the view has been still for a moment.

/** Faster than this the view counts as moving: share of the height above the map per second. */
const MOVE_PAN_PER_S = 0.12
/** Or this many radians per second of turning. A slow presentation orbit stays under both. */
const MOVE_TURN_PER_S = 0.1
/** The view must hold still this long before names are placed again. */
const SETTLE_MS = 220
/**
 * After a stop, tiles that were still loading bring their names in late, and
 * a placement made the moment the view settled is redone a few hundred ms
 * later with new names in it. So the first still placement also waits until
 * no tile has brought names for this long…
 */
const TILES_QUIET_MS = 350
/** …but never longer than this after the view settled. */
const TILES_WAIT_MAX_MS = 1500
/** What stays of a name while the camera moves, by layer; the rest go. */
const MOVING_OPACITY: Readonly<Record<string, number>> = { place: 0.32, 'water-name': 0.2 }

interface Entry {
  cand: ScreenLabelCandidate
  sprite: THREE.Sprite | null
  /** Label size in CSS px (texture aspect × font). */
  w: number
  h: number
  opacity: number
  target: number
}

function drawLabelTexture(c: ScreenLabelCandidate, dpr: number, family: string): { tex: THREE.CanvasTexture; w: number; h: number } | null {
  if (typeof document === 'undefined') return null
  const l = c.layer
  const size = c.cssSize
  const text = l.uppercase ? c.text.toLocaleUpperCase() : c.text
  const font = `${l.italic ? 'italic ' : ''}${l.weight} ${size}px ${family}`
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')
  if (!g) return null
  g.font = font
  const spacing = l.letterSpacing ?? 0
  const textW = g.measureText(text).width + Math.max(0, text.length - 1) * spacing
  const dot = l.dot ? l.dot(c.props) : null
  const dotR = dot ? 3.5 : 0
  const halo = l.haloWidth
  const wCss = Math.ceil(textW + halo * 2 + (dot ? dotR * 2 + 5 : 0) + 2)
  const hCss = Math.ceil(size * 1.35 + halo * 2)
  canvas.width = Math.max(1, Math.round(wCss * dpr))
  canvas.height = Math.max(1, Math.round(hCss * dpr))
  g.scale(dpr, dpr)
  g.font = font
  try { (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px` } catch { /* older engines */ }
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  let x = halo + 1
  if (dot) {
    g.beginPath(); g.arc(x + dotR, hCss / 2, dotR, 0, Math.PI * 2)
    g.fillStyle = dot; g.fill()
    g.lineWidth = 1; g.strokeStyle = l.halo; g.stroke()
    x += dotR * 2 + 5
  }
  g.textAlign = 'left'
  g.lineWidth = halo * 2
  g.strokeStyle = l.halo
  g.strokeText(text, x, hCss / 2)
  g.fillStyle = typeof l.color === 'string' ? l.color : l.color(c.props)
  g.fillText(text, x, hCss / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return { tex, w: wCss, h: hCss }
}

export function createScreenLabelLayer(fontFamily = "Geist, 'Inter', system-ui, sans-serif"): ScreenLabelLayer {
  const group = new THREE.Group()
  group.name = 'screen-labels'
  const regions = new Map<string, ScreenLabelCandidate[]>()
  const entries = new Map<string, Entry>()
  let lastT = performance.now()
  let builtDpr = 0
  const v = new THREE.Vector3()
  const eye = new THREE.Vector3()
  const lastEye = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const lastDir = new THREE.Vector3()
  let lastZoom = 1
  let seen = false
  let movedAt = -Infinity
  /** Last time a tile brought or took names. */
  let regionsAt = -Infinity
  /** Whether a placement was made since the view last settled. */
  let stillPlaced = true
  /** Keys placed the last time the view was still. */
  let placedKeys: string[] = []
  let lastHorizonM = Infinity
  let placedAt = 0
  let lastBeyond = 0
  let lastBlocked: ScreenPoint[][] = []
  let lastPlacedBoxes: Array<{ key: string; box: ScreenBox; distM: number }> = []
  const distOf = new Map<string, number>()
  const corner = new THREE.Vector3()

  function ensureSprite(e: Entry, dpr: number): void {
    if (e.sprite) return
    const drawn = drawLabelTexture(e.cand, dpr, fontFamily)
    if (!drawn) return
    const mat = new THREE.SpriteMaterial({
      map: drawn.tex, transparent: true, depthTest: false, depthWrite: false,
      sizeAttenuation: false, opacity: 0,
    })
    // Labels never go through tone mapping or fog: they are UI, and must read
    // the same in a night look as by day.
    mat.toneMapped = false
    mat.fog = false
    const s = new THREE.Sprite(mat)
    s.renderOrder = 1000
    s.raycast = () => {}
    s.frustumCulled = false
    e.sprite = s
    e.w = drawn.w
    e.h = drawn.h
    group.add(s)
  }

  function dropSprite(e: Entry): void {
    if (!e.sprite) return
    group.remove(e.sprite)
    e.sprite.material.map?.dispose()
    e.sprite.material.dispose()
    e.sprite = null
  }

  return {
    group,

    setRegion(key, cands) { regions.set(key, cands); if (cands.length) regionsAt = performance.now() },
    removeRegion(key) { if (regions.delete(key)) regionsAt = performance.now() },

    update(camera, viewport, visibleRegions, dpr, tileFrame, keepOut) {
      const now = performance.now()
      const rawDt = (now - lastT) / 1000
      const dt = Math.min(0.1, rawDt)
      lastT = now

      // Is the camera moving? Speeds, not per-frame steps, so the answer does
      // not depend on the frame rate.
      camera.getWorldPosition(eye)
      camera.getWorldDirection(dir)
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1
      v.set(0, 0, 0).applyMatrix4(tileFrame)
      const heightM = eye.y - v.y
      if (seen && rawDt > 0) {
        const span = Math.max(10, Math.abs(heightM))
        const pan = eye.distanceTo(lastEye) / span / rawDt
        const turn = dir.angleTo(lastDir) / rawDt
        const zoomed = Math.abs(Math.log(zoom / lastZoom)) / rawDt
        if (pan > MOVE_PAN_PER_S || turn > MOVE_TURN_PER_S || zoomed > MOVE_PAN_PER_S) movedAt = now
      }
      seen = true
      lastEye.copy(eye); lastDir.copy(dir); lastZoom = zoom
      const viewMoving = now - movedAt < SETTLE_MS
      if (viewMoving) stillPlaced = false
      // Just stopped and tiles are still arriving: hold as if moving, once.
      const moving = viewMoving || (!stillPlaced
        && now - regionsAt < TILES_QUIET_MS && now - movedAt < SETTLE_MS + TILES_WAIT_MAX_MS)
      if (!moving) stillPlaced = true
      if (dpr !== builtDpr) {
        // Re-rasterise at the new DPR (a window moved to another monitor).
        for (const e of entries.values()) dropSprite(e)
        builtDpr = dpr
      }

      // 1. The candidates of what is on screen, deduplicated by place.
      const live = new Map<string, ScreenLabelCandidate>()
      for (const key of visibleRegions) {
        const list = regions.get(key)
        if (!list) continue
        for (const c of list) {
          const prev = live.get(c.key)
          if (!prev || c.priority > prev.priority) live.set(c.key, c)
        }
      }
      for (const [k, c] of live) {
        if (!entries.has(k)) entries.set(k, { cand: c, sprite: null, w: 0, h: 0, opacity: 0, target: 0 })
      }

      // 2. Project, then greedy placement by priority over the whole screen.
      const cam = camera as THREE.PerspectiveCamera & THREE.OrthographicCamera
      // sizeAttenuation:false → perspective: scale in "view height" units,
      // px / viewport × 2·tan(fov/2). Orthographic: world units, px / viewport
      // × the visible height. Either gives exactly e.h CSS px on screen.
      const perPx = cam.isPerspectiveCamera
        ? (2 * Math.tan((cam.fov * Math.PI) / 360)) / viewport.height
        : ((cam.top - cam.bottom) / (cam.zoom || 1)) / viewport.height
      const onScreen: ScreenItem[] = []
      // At eye level the names stand in the street (see labelsWanted).
      const wanted = labelsWanted(heightM)
      // Names beyond the horizon limit are not candidates (labelHorizonM).
      const horizonM = labelHorizonM(heightM, dir.y, horizonFactor)
      let beyond = 0
      if (moving) {
        // Nothing is placed or rasterised: what was there dims or leaves.
        const kept = new Set(placedKeys)
        for (const e of entries.values()) {
          e.target = wanted && kept.has(e.cand.key) && live.has(e.cand.key)
            ? MOVING_OPACITY[e.cand.layer.id] ?? 0 : 0
        }
      }
      for (const e of moving ? [] : entries.values()) {
        e.target = 0
        if (!wanted || !live.has(e.cand.key)) continue
        // Normalized planar (centred) → world, through the tiles' own matrix.
        v.set(e.cand.nx - 0.5, e.cand.ny - 0.5, 0).applyMatrix4(tileFrame)
        const world = v.clone()
        const distM = world.distanceTo(eye)
        if (distM > horizonM) { beyond++; continue }
        distOf.set(e.cand.key, distM)
        v.project(camera)
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue
        // Only now, for a name that is actually on screen, rasterise it.
        ensureSprite(e, dpr)
        if (!e.sprite) continue
        e.sprite.position.copy(world)
        const sy = ((1 - v.y) / 2) * viewport.height
        // In a pitched view the bottom of the screen is near the viewer: among
        // POIs and house numbers, nearer wins (places keep their pure rank —
        // a city name matters at any distance).
        const near = e.cand.layer.id === 'poi' || e.cand.layer.id === 'housenumber'
          ? NEAR_BONUS * (sy / Math.max(1, viewport.height)) : 0
        onScreen.push({
          key: e.cand.key, layerId: e.cand.layer.id, text: e.cand.text, priority: e.cand.priority + near, w: e.w, h: e.h,
          sx: ((v.x + 1) / 2) * viewport.width, sy,
        })
      }
      if (!moving) {
        // The models are what the map is there for: no name over them.
        // Their outline, not their rectangle: a box seen at 45° is a
        // hexagon, and its rectangle blanked two big triangles of free map.
        const blocked: ScreenPoint[][] = []
        for (const box of keepOut ?? []) {
          const r = screenHullOf(box, camera, viewport, corner)
          if (r) blocked.push(r)
        }
        // Names already on screen keep their spot (KEEP_BONUS).
        placedKeys = placeScreenLabels(onScreen, MAX_VISIBLE, SCREEN_QUOTA, blocked, new Set(placedKeys), keepBonus)
        placedAt = now
        lastHorizonM = horizonM
        lastBeyond = beyond
        lastBlocked = blocked
        const byKey = new Map(onScreen.map((it) => [it.key, it]))
        lastPlacedBoxes = placedKeys.map((key) => {
          const it = byKey.get(key)!
          return { key, box: [it.sx - it.w / 2, it.sy - it.h / 2, it.sx + it.w / 2, it.sy + it.h / 2] as ScreenBox, distM: distOf.get(key) ?? 0 }
        })
        distOf.clear()
        for (const key of placedKeys) {
          const e = entries.get(key)!
          e.target = 1
          e.sprite!.scale.set(e.w * perPx, e.h * perPx, 1)
        }
      }

      // 3. Fade, and free what is fully gone and no longer a candidate.
      for (const [k, e] of entries) {
        e.opacity = e.target > e.opacity
          ? Math.min(e.target, e.opacity + FADE_IN_PER_S * dt)
          : Math.max(e.target, e.opacity - FADE_OUT_PER_S * dt)
        if (e.sprite) {
          e.sprite.material.opacity = e.opacity
          e.sprite.visible = e.opacity > 0.01
        }
        if (e.opacity <= 0 && !live.has(k)) { dropSprite(e); entries.delete(k) }
      }
    },

    debug(visibleRegions) {
      let candidates = 0
      for (const l of regions.values()) candidates += l.length
      let visibleMatched = 0
      if (visibleRegions) for (const k of visibleRegions) if (regions.has(k)) visibleMatched++
      return {
        regions: regions.size, candidates, entries: entries.size, visibleMatched, sampleRegion: regions.keys().next().value,
        placed: [...placedKeys], placedAt, horizonM: lastHorizonM, beyondHorizon: lastBeyond,
        blocked: lastBlocked, placedBoxes: lastPlacedBoxes,
      }
    },

    dispose() {
      for (const e of entries.values()) dropSprite(e)
      entries.clear()
      regions.clear()
    },
  }
}

/**
 * Below this height above the map plane, metres, no place names are shown.
 *
 * A name is a sprite at its place on the ground, drawn at a constant size on
 * screen. From above that is a map; at a walker's eye it is a sign floating in
 * the street — "Barcelona" and the corner shop hanging across the view of the
 * Sagrada Família, in every screenshot taken there.
 */
export const STREET_LEVEL_M = 40

/** Whether place names belong on screen with the camera this high, metres. */
export function labelsWanted(heightM: number): boolean {
  return !(heightM < STREET_LEVEL_M)
}

/**
 * How far from the eye a name may be, metres: HORIZON_FACTOR × the distance
 * from the eye to where the middle of the view meets the map. `dirY` is the
 * view direction's vertical component (−1 straight down).
 */
export function labelHorizonM(heightM: number, dirY: number, factor = HORIZON_FACTOR): number {
  const h = Math.max(1, Math.abs(heightM))
  const down = Math.max(Math.sin(MIN_FOCUS_PITCH_RAD), -dirY)
  return factor * (h / down)
}

/** A rectangle on screen, CSS px: [left, top, right, bottom]. */
export type ScreenBox = [number, number, number, number]
/** A point on screen, CSS px. */
export type ScreenPoint = [number, number]

/** Convex hull of screen points (monotone chain). */
export function convexHull(points: readonly ScreenPoint[]): ScreenPoint[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: ScreenPoint[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: ScreenPoint[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/**
 * Whether a rectangle overlaps a convex polygon (separating axes: the two of
 * the rectangle and one normal per polygon edge). Touching is not overlap.
 */
export function boxHitsHull(box: ScreenBox, hull: readonly ScreenPoint[]): boolean {
  if (hull.length === 0) return false
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of hull) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (!(box[0] < x1 && box[2] > x0 && box[1] < y1 && box[3] > y0)) return false
  if (hull.length < 3) return true
  const corners: ScreenPoint[] = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    const nx = b[1] - a[1], ny = a[0] - b[0]
    let hMin = Infinity, hMax = -Infinity, rMin = Infinity, rMax = -Infinity
    for (const [x, y] of hull) { const d = x * nx + y * ny; if (d < hMin) hMin = d; if (d > hMax) hMax = d }
    for (const [x, y] of corners) { const d = x * nx + y * ny; if (d < rMin) rMin = d; if (d > rMax) rMax = d }
    if (rMax <= hMin || rMin >= hMax) return false
  }
  return true
}

/**
 * The outline a world box covers on screen (convex hull of its 8 corners),
 * or null under the same conditions as screenBoxOf.
 */
export function screenHullOf(
  box: THREE.Box3, camera: THREE.Camera, viewport: { width: number; height: number },
  scratch = new THREE.Vector3(),
): ScreenPoint[] | null {
  if (box.isEmpty()) return null
  const pts: ScreenPoint[] = []
  for (let i = 0; i < 8; i++) {
    scratch.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
    scratch.project(camera)
    if (!(scratch.z > -1 && scratch.z < 1)) return null
    pts.push([((scratch.x + 1) / 2) * viewport.width, ((1 - scratch.y) / 2) * viewport.height])
  }
  const hull = convexHull(pts)
  if (hull.every(([x]) => x < 0) || hull.every(([x]) => x > viewport.width)
    || hull.every(([, y]) => y < 0) || hull.every(([, y]) => y > viewport.height)) return null
  return hull
}

/**
 * The rectangle a world box covers on screen, or null when it is off screen or
 * the camera is inside or beside it (a corner behind the eye has no place on
 * screen, and a view from within a model has no map names to keep off it).
 */
export function screenBoxOf(
  box: THREE.Box3, camera: THREE.Camera, viewport: { width: number; height: number },
  scratch = new THREE.Vector3(),
): ScreenBox | null {
  if (box.isEmpty()) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < 8; i++) {
    scratch.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
    scratch.project(camera)
    if (!(scratch.z > -1 && scratch.z < 1)) return null
    const sx = ((scratch.x + 1) / 2) * viewport.width
    const sy = ((1 - scratch.y) / 2) * viewport.height
    if (sx < x0) x0 = sx
    if (sx > x1) x1 = sx
    if (sy < y0) y0 = sy
    if (sy > y1) y1 = sy
  }
  if (x1 < 0 || y1 < 0 || x0 > viewport.width || y0 > viewport.height) return null
  return [x0, y0, x1, y1]
}

export interface ScreenItem {
  key: string
  /** The words, when known: the same words are not placed twice close by. */
  text?: string
  /** Style layer — quotas are per layer (POIs must not crowd out places). */
  layerId?: string
  priority: number
  /** Screen centre and size, CSS px. */
  sx: number; sy: number; w: number; h: number
}

/**
 * Greedy placement over the WHOLE screen: highest priority first, a label is
 * kept when its padded box hits no kept box; at most `max` are kept. Names in
 * `previous` (placed the frame before) rank KEEP_BONUS higher, so a still view
 * does not reshuffle. Pure, so the rule is tested without a renderer.
 */
export function placeScreenLabels(
  items: readonly ScreenItem[], max: number, quota: Readonly<Record<string, number>> = {},
  blocked: ReadonlyArray<ScreenBox | readonly ScreenPoint[]> = [],
  previous?: ReadonlySet<string>, bonus = KEEP_BONUS,
): string[] {
  const rank = (it: ScreenItem) => it.priority + (previous?.has(it.key) ? bonus : 0)
  const ordered = [...items].sort((a, b) => rank(b) - rank(a))
  // Blocked shapes count as already placed: nothing may touch them.
  const hulls: Array<readonly ScreenPoint[]> = []
  const placed: ScreenBox[] = []
  for (const b of blocked) {
    if (typeof b[0] === 'number') placed.push(b as ScreenBox)
    else hulls.push(b as readonly ScreenPoint[])
  }
  const texts: Array<{ text: string; sx: number; sy: number }> = []
  const keys: string[] = []
  const used = new Map<string, number>()
  for (const it of ordered) {
    if (keys.length >= max) break
    const q = it.layerId ? quota[it.layerId] : undefined
    const n = it.layerId ? used.get(it.layerId) ?? 0 : 0
    if (q !== undefined && n >= q) continue
    const box: [number, number, number, number] = [
      it.sx - it.w / 2 - PAD_PX, it.sy - it.h / 2 - PAD_PX, it.sx + it.w / 2 + PAD_PX, it.sy + it.h / 2 + PAD_PX,
    ]
    if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue
    if (hulls.some((h) => boxHitsHull(box, h))) continue
    const text = it.text
    if (text && texts.some((t) => t.text === text && Math.hypot(t.sx - it.sx, t.sy - it.sy) < SAME_TEXT_PX)) continue
    if (text) texts.push({ text, sx: it.sx, sy: it.sy })
    placed.push(box)
    keys.push(it.key)
    if (it.layerId) used.set(it.layerId, n + 1)
  }
  return keys
}

/** Identity of a place across tiles: same name, class, rounded position. */
export function labelKey(layerId: string, text: string, nx: number, ny: number): string {
  // ~1 km grid at the equator: the same town reported by two zoom levels'
  // tiles lands in the same cell; two different towns of one name do not.
  return `${layerId}|${text}|${Math.round(nx * 40000)}|${Math.round(ny * 40000)}`
}
