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
  ): void
  dispose(): void
  /** Dev diagnosis: what the layer holds right now. */
  debug(visibleRegions?: ReadonlySet<string>): { regions: number; candidates: number; entries: number; visibleMatched: number; sampleRegion?: string }
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
/** Fade speed (opacity per second). */
const FADE_PER_S = 5
const PAD_PX = 4

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

    setRegion(key, cands) { regions.set(key, cands) },
    removeRegion(key) { regions.delete(key) },

    update(camera, viewport, visibleRegions, dpr, tileFrame) {
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastT) / 1000)
      lastT = now
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
      for (const e of entries.values()) {
        e.target = 0
        if (!live.has(e.cand.key)) continue
        // Normalized planar (centred) → world, through the tiles' own matrix.
        v.set(e.cand.nx - 0.5, e.cand.ny - 0.5, 0).applyMatrix4(tileFrame)
        const world = v.clone()
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
          key: e.cand.key, layerId: e.cand.layer.id, priority: e.cand.priority + near, w: e.w, h: e.h,
          sx: ((v.x + 1) / 2) * viewport.width, sy,
        })
      }
      for (const key of placeScreenLabels(onScreen, MAX_VISIBLE, SCREEN_QUOTA)) {
        const e = entries.get(key)!
        e.target = 1
        e.sprite!.scale.set(e.w * perPx, e.h * perPx, 1)
      }

      // 3. Fade, and free what is fully gone and no longer a candidate.
      for (const [k, e] of entries) {
        const step = FADE_PER_S * dt
        e.opacity = e.target > e.opacity ? Math.min(e.target, e.opacity + step) : Math.max(e.target, e.opacity - step)
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
      return { regions: regions.size, candidates, entries: entries.size, visibleMatched, sampleRegion: regions.keys().next().value }
    },

    dispose() {
      for (const e of entries.values()) dropSprite(e)
      entries.clear()
      regions.clear()
    },
  }
}

export interface ScreenItem {
  key: string
  /** Style layer — quotas are per layer (POIs must not crowd out places). */
  layerId?: string
  priority: number
  /** Screen centre and size, CSS px. */
  sx: number; sy: number; w: number; h: number
}

/**
 * Greedy placement over the WHOLE screen: highest priority first, a label is
 * kept when its padded box hits no kept box; at most `max` are kept. Pure, so
 * the rule is tested without a renderer.
 */
export function placeScreenLabels(
  items: readonly ScreenItem[], max: number, quota: Readonly<Record<string, number>> = {},
): string[] {
  const ordered = [...items].sort((a, b) => b.priority - a.priority)
  const placed: Array<[number, number, number, number]> = []
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
