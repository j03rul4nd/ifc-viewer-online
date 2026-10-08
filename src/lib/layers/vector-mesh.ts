// ─── vector-mesh ──────────────────────────────────────────────────────────────
// Projected vector features (layers/geojson.ts → projectLayer) → three.js.
//
//   • Routes / polylines → flat RIBBONS of a real width in metres. GL lines are
//     1 px on most GPUs whatever lineWidth says, which reads as nothing over a
//     satellite basemap; a 3 m ribbon reads as a road at any zoom.
//   • Zones / areas → a translucent FILL plus an outline ribbon, or a VOLUME
//     (walls + roof) when the data carries a height or the user asks for one.
//   • Points → small spheres, instanced (a POI layer can be thousands).
//
// Heights follow the HeightMode chosen for the layer:
//   absolute — y is the elevation already projected through the anchor;
//   relative — y is "metres above ground": the GROUND function is sampled per
//              vertex, so a route drapes over terrain when there is terrain and
//              lies on the ground plane when there is not;
//   ignore   — everything on the ground.
// Draped geometry is densified first: a 200 m segment between two vertices is a
// straight chord that would cut through a hillside (same lesson as ground-frame).
//
// One BufferGeometry per kind per layer — a layer is a handful of draw calls,
// not one per feature.

import * as THREE from 'three'
import type { HeightMode, ProjectedFeature } from './geojson'
import type { ScenePoint } from '../geo/scene-anchor'
import type { IconId, SymbolStyle } from './symbology'
import type { Aggregation, AreaStyle, LineStyle, PointStyle, ResolvedStyle, ZoomBands } from './style-groups'
import { buildPointLodGroup, updatePointLod, type PointInput } from './point-lod'
import { buildHexMesh, buildHeatPlane } from './aggregate-mesh'
import type { PlanSample } from './aggregate'

export interface VectorStyle {
  /** CSS colour. */
  color: string
  /** 0..1 — fills and volumes; ribbons stay opaque so routes never wash out. */
  opacity: number
  /** Ribbon width for lines, metres. Outlines use a third of it. */
  widthM: number
  /** Fill polygons (otherwise outline only). */
  fill: boolean
  /** Extrude polygons that have no height of their own by this much (0 = flat). */
  extrudeM: number
  /** Sphere radius for points, metres. */
  pointRadiusM: number
}

export const DEFAULT_STYLE: VectorStyle = {
  color: '#ff7a1a', opacity: 0.35, widthM: 3, fill: true, extrudeM: 0, pointRadiusM: 2,
}

/** Scene height of the ground under (x, z). */
export type GroundFn = (x: number, z: number) => number

export interface BuildInput {
  features: ProjectedFeature[]
  style: VectorStyle
  heightMode: HeightMode
  /** anchor.scene.y — what "0 m above ground" was projected to. */
  anchorY: number
  ground: GroundFn
  /** Max segment length when draping, metres. */
  densifyM?: number
  /**
   * Resolved symbology per feature (symbology.resolveSymbol): null hides it.
   * Absent = the whole layer in `style`.
   */
  symbols?: Array<SymbolStyle | null>
  /** User GLB templates by asset id, for `model` symbols. */
  assets?: Map<string, THREE.Object3D>
  /** Icon artwork as a texture (canvas-drawn by the caller), or null without a canvas. */
  iconTexture?: (icon: IconId, color: string) => THREE.Texture | null
  /**
   * Group styles per feature (style-groups.resolveStyle). Wins over `symbols`.
   * A style with visible:false — or null — hides the feature.
   */
  styles?: Array<ResolvedStyle | null>
  /** Text label per feature (group's labelField), shown in the detail band. */
  labels?: Array<string | null>
  /** Extrusion per feature from the group's heightField, metres (NaN = none). */
  heights?: number[]
  /** Zoom bands for points; absent = always full detail. */
  zoom?: ZoomBands
  /** Far-away summary of the layer's points, and the value each feature adds. */
  aggregate?: Aggregation
  aggValues?: number[]
}

export interface BuiltLayer {
  group: THREE.Group
  bounds: THREE.Box3
  stats: { ribbons: number; fills: number; volumes: number; points: number; triangles: number }
}

/** Ribbons float this far above what they rest on, against z-fighting. */
const LIFT_M = 0.15

/** What one feature looks like, whichever input described it. */
interface FeatureLook { point: PointStyle; line: LineStyle; area: AreaStyle }

const ALWAYS: ZoomBands = { detailM: Infinity, iconM: Infinity, dotM: Infinity }

function lookOf(input: BuildInput, fi: number): FeatureLook | null {
  const st = input.styles?.[fi]
  if (st !== undefined) return st && st.visible ? st : null
  const base = input.style
  const sym = input.symbols ? input.symbols[fi] : undefined
  if (sym === null) return null
  const color = sym?.color ?? base.color
  return {
    point: sym
      ? { symbol: sym.symbol, color, size: sym.sizeM, labelField: null }
      : { symbol: { kind: 'primitive', shape: 'sphere' }, color, size: base.pointRadiusM * 2, labelField: null },
    line: { color, widthM: base.widthM, opacity: 1 },
    area: { color, fillOpacity: base.fill ? base.opacity : 0, outline: true, extrudeM: base.extrudeM, heightField: null },
  }
}

export function buildVectorLayer(input: BuildInput): BuiltLayer {
  const { features, style, heightMode, anchorY, ground } = input
  const step = input.densifyM ?? 8
  const drape = heightMode !== 'absolute'

  /** Final scene y for a projected point. */
  const yOf = (p: ScenePoint): number =>
    drape ? ground(p.x, p.z) + (p.y - anchorY) : p.y

  // One set of builders per colour/opacity: categorised layers draw each group
  // in its own material without a per-vertex colour attribute.
  interface Builders { ribbon: GeometryBuilder; outline: GeometryBuilder; fill: GeometryBuilder; volume: GeometryBuilder; color: string; opacity: number; fillOpacity: number }
  const byKey = new Map<string, Builders>()
  const buildersFor = (color: string, opacity: number, fillOpacity: number): Builders => {
    const key = `${color}|${opacity}|${fillOpacity}`
    let b = byKey.get(key)
    if (!b) {
      b = { ribbon: new GeometryBuilder(), outline: new GeometryBuilder(), fill: new GeometryBuilder(), volume: new GeometryBuilder(), color, opacity, fillOpacity }
      byKey.set(key, b)
    }
    return b
  }
  /** Flow chevrons, one mesh per animation speed. */
  const flowBuilders = new Map<number, GeometryBuilder>()
  /** Points grouped by what they look like. */
  const pointGroups = new Map<string, { style: PointStyle; points: PointInput[] }>()
  const samples: PlanSample[] = []
  const stats = { ribbons: 0, fills: 0, volumes: 0, points: 0, triangles: 0 }

  for (let fi = 0; fi < features.length; fi++) {
    const f = features[fi]
    const look = lookOf(input, fi)
    if (!look) continue // a group hid it
    if (f.type === 'point') {
      const ps = look.point
      const key = `${ps.symbol.kind}:${JSON.stringify(ps.symbol)}:${ps.color}:${ps.size}`
      let g = pointGroups.get(key)
      if (!g) { g = { style: ps, points: [] }; pointGroups.set(key, g) }
      for (const p of f.lists[0] ?? []) {
        const pos = new THREE.Vector3(p.x, yOf(p), p.z)
        g.points.push({ pos, feature: fi, label: input.labels?.[fi] ?? null })
        samples.push({ x: pos.x, z: pos.z, y: pos.y, value: input.aggValues?.[fi] ?? NaN })
      }
      stats.points += f.lists[0]?.length ?? 0
      continue
    }
    if (f.type === 'line') {
      const b = buildersFor(look.line.color, look.line.opacity, 0)
      b.ribbon.current = fi
      const ls = look.line
      for (const part of f.lists) {
        const draped = (drape ? densify(part, step) : part).map((p) => ({ x: p.x, y: yOf(p) + LIFT_M, z: p.z }))
        const line = ls.offsetM ? offsetLine(draped, ls.offsetM) : draped
        addRibbon(b.ribbon, line, ls.widthM, false)
        if (ls.flow) {
          const speed = ls.flowSpeed ?? 8
          let fb = flowBuilders.get(speed)
          if (!fb) { fb = new GeometryBuilder(); flowBuilders.set(speed, fb) }
          fb.current = fi
          // Chevrons ride a hair above the ribbon, at ~60 % of its width.
          addRibbon(fb, line.map((p) => ({ ...p, y: p.y + 0.05 })), ls.widthM * 0.62, false, FLOW_PATTERN_M)
        }
        stats.ribbons++
      }
      continue
    }
    // Polygons: lists are rings, ringCounts says how many belong to each polygon.
    const a = look.area
    const b = buildersFor(a.color, 1, a.fillOpacity)
    b.outline.current = b.fill.current = b.volume.current = fi
    let k = 0
    for (const count of f.ringCounts) {
      const rings = f.lists.slice(k, k + count).map((r) => openRing(drape ? densify(r, step) : r))
      k += count
      if (rings.length === 0 || rings[0].length < 3) continue
      const fieldH = input.heights?.[fi]
      const h = f.extrusionM > 0 ? f.extrusionM : Number.isFinite(fieldH) && fieldH! > 0 ? fieldH! : a.extrudeM
      if (h > 0) {
        // Base on the LOWEST ground under the footprint (building-mesh rule):
        // on a slope, a base at the centroid leaves the downhill side floating.
        let base = Infinity
        for (const r of rings) for (const p of r) base = Math.min(base, yOf(p))
        addVolume(b.volume, rings, base, base + h)
        stats.volumes++
      } else if (a.fillOpacity > 0) {
        addFill(b.fill, rings, (p) => yOf(p) + LIFT_M * 0.5)
        stats.fills++
      }
      if (a.outline) {
        for (const r of rings) {
          addRibbon(b.outline, r.map((p) => ({ x: p.x, y: yOf(p) + LIFT_M, z: p.z })), Math.max(0.5, style.widthM / 3), true)
        }
      }
    }
  }

  const group = new THREE.Group()
  group.name = 'vector-layer'

  const meshOf = (b: GeometryBuilder, mat: THREE.Material, name: string): void => {
    if (b.isEmpty()) return
    const geom = b.build()
    stats.triangles += geom.index ? geom.index.count / 3 : 0
    const mesh = new THREE.Mesh(geom, mat)
    mesh.name = name
    group.add(mesh)
  }

  for (const b of byKey.values()) {
    const color = new THREE.Color(b.color)
    meshOf(b.ribbon, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: b.opacity < 1, opacity: b.opacity,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), 'vector-ribbons')
    meshOf(b.outline, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), 'vector-outlines')
    meshOf(b.fill, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: b.fillOpacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }), 'vector-fills')
    meshOf(b.volume, new THREE.MeshStandardMaterial({
      color, side: THREE.DoubleSide, transparent: b.fillOpacity < 1, opacity: Math.max(b.fillOpacity, 0.25),
      depthWrite: b.fillOpacity >= 1, roughness: 0.8, metalness: 0,
    }), 'vector-volumes')
  }

  const tex = flowBuilders.size ? flowTexture() : null
  for (const [speed, fb] of flowBuilders) {
    if (!tex || fb.isEmpty()) continue
    // A material (and texture view) per speed: each animates its own offset.
    const map = tex.clone()
    map.needsUpdate = true
    meshOf(fb, new THREE.MeshBasicMaterial({
      map, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }), 'vector-flow')
    const mesh = group.children[group.children.length - 1]
    mesh.userData.flowSpeed = speed
  }

  const pointBounds = new THREE.Box3()
  const zoom = input.zoom ?? ALWAYS
  for (const g of pointGroups.values()) {
    const obj = buildPointLodGroup(g, { iconTexture: input.iconTexture, assets: input.assets })
    if (!obj) continue
    obj.userData.zoom = zoom
    // Until a camera says otherwise, everything shows in full.
    updatePointLod(obj, g.points[0].pos, ALWAYS)
    group.add(obj)
    for (const p of g.points) {
      pointBounds.expandByPoint(p.pos)
      pointBounds.expandByPoint(new THREE.Vector3(p.pos.x, p.pos.y + Math.max(1, g.style.size), p.pos.z))
    }
  }

  // Far-away summary of the points.
  const agg = input.aggregate
  if (agg && agg.kind !== 'none' && samples.length > 0) {
    const obj = agg.kind === 'hexbin' ? buildHexMesh(samples, agg) : buildHeatPlane(samples, agg)
    if (obj) {
      obj.userData.isAggregate = true
      obj.userData.fromM = agg.fromM
      obj.visible = false
      group.add(obj)
    }
  }

  group.userData.featureIds = features.map((f) => f.id)
  group.updateMatrixWorld(true)
  const bounds = pointBounds.clone()
  for (const child of group.children) {
    if (child.userData.isPointGroup || child.userData.isAggregate) continue
    bounds.expandByObject(child)
  }
  return { group, bounds, stats }
}

/**
 * Apply zoom bands and aggregate switching for a camera position. Called per
 * frame by the layer system; cheap when nothing crosses a band.
 */
export function updateLayerLod(group: THREE.Object3D, cam: THREE.Vector3, bounds: THREE.Box3): boolean {
  // Distance to the layer's footprint decides "far enough for the summary".
  const nearest = bounds.isEmpty() ? cam : bounds.clampPoint(cam, new THREE.Vector3())
  const distToLayer = cam.distanceTo(nearest)
  let aggregateOn = false
  for (const child of group.children) {
    if (!child.userData.isAggregate) continue
    child.visible = distToLayer > (child.userData.fromM as number)
    aggregateOn ||= child.visible
  }
  for (const child of group.children) {
    if (child.userData.isPointGroup) {
      updatePointLod(child, cam, (child.userData.zoom as ZoomBands) ?? ALWAYS, aggregateOn)
    }
  }
  return aggregateOn
}

/** Which feature a raycast hit on a built layer belongs to, or -1. */
export function featureOfHit(hit: THREE.Intersection): number {
  const o = hit.object
  // Sprites and model clones carry their feature on themselves or an ancestor.
  for (let a: THREE.Object3D | null = o; a; a = a.parent) {
    if (typeof a.userData.feature === 'number') return a.userData.feature as number
    if (a.userData.vectorLayerId !== undefined) break
  }
  if (o instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
    const map = o.userData.instanceFeature as Int32Array | undefined
    return map?.[hit.instanceId] ?? -1
  }
  const mesh = o as THREE.Mesh
  const map = mesh.geometry?.userData.faceFeature as Int32Array | undefined
  return hit.faceIndex !== undefined && hit.faceIndex !== null && map ? map[hit.faceIndex] ?? -1 : -1
}

export function disposeVectorLayer(group: THREE.Object3D): void {
  const shared = new Set<THREE.Object3D>()
  group.traverse((o) => { if (o.userData.sharedAsset) o.traverse((c) => shared.add(c)) })
  group.traverse((o) => {
    if (shared.has(o)) return
    // Icon and label TEXTURES are cached and shared across layers: only the
    // per-sprite material goes.
    const sprite = o as THREE.Sprite
    if (sprite.isSprite) { sprite.material.dispose(); return }
    const pts = o as THREE.Points
    if (pts.isPoints) { pts.geometry.dispose(); (pts.material as THREE.Material).dispose(); return }
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mats.forEach((m) => {
      // The heat image is this layer's own texture.
      if (o.name === 'vector-heatmap' || o.name === 'vector-flow') (m as THREE.MeshBasicMaterial).map?.dispose()
      m.dispose()
    })
  })
  group.removeFromParent()
}

class GeometryBuilder {
  readonly pos: number[] = []
  readonly idx: number[] = []
  /** Texture coordinates, only for builders that carry a pattern (flow). */
  readonly uv: number[] = []
  /** Feature index of every triangle, for picking. */
  readonly tri: number[] = []
  /** Feature the next triangles belong to. */
  current = 0
  /** Call after pushing indices: tags the new triangles with `current`. */
  tag(): void { while (this.tri.length < this.idx.length / 3) this.tri.push(this.current) }
  get vertexCount(): number { return this.pos.length / 3 }
  push(x: number, y: number, z: number): number { this.pos.push(x, y, z); return this.vertexCount - 1 }
  isEmpty(): boolean { return this.idx.length === 0 }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    if (this.uv.length === (this.pos.length / 3) * 2 && this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeVertexNormals()
    g.computeBoundingBox()
    g.computeBoundingSphere()
    g.userData.faceFeature = Int32Array.from(this.tri)
    return g
  }
}

/** Split segments longer than `step` (plan distance) so draping follows terrain. */
export function densify(line: ScenePoint[], step: number): ScenePoint[] {
  if (line.length < 2 || step <= 0) return line
  const out: ScenePoint[] = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step)
    for (let s = 1; s < n; s++) {
      const t = s / n
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
    }
    out.push(b)
  }
  return out
}

/**
 * The same polyline shifted `m` metres to the right of its direction of travel
 * (plan only). Per-vertex miter shift, capped so sharp turns don't spike.
 */
export function offsetLine(line: ScenePoint[], m: number): ScenePoint[] {
  if (!m || line.length < 2) return line
  const n = line.length
  const dirAt = (i: number, j: number): [number, number] => {
    const dx = line[j].x - line[i].x, dz = line[j].z - line[i].z
    const l = Math.hypot(dx, dz) || 1
    return [dx / l, dz / l]
  }
  return line.map((p, i) => {
    const d0 = i > 0 ? dirAt(i - 1, i) : dirAt(i, i + 1)
    const d1 = i < n - 1 ? dirAt(i, i + 1) : d0
    // Right-hand normal of (dx, dz) in the scene plan (x east, z south) is (−dz, dx).
    let rx = -(d0[1] + d1[1]), rz = d0[0] + d1[0]
    const rl = Math.hypot(rx, rz)
    if (rl < 1e-6) { rx = -d1[1]; rz = d1[0] } else { rx /= rl; rz /= rl }
    const cos = rx * -d1[1] + rz * d1[0]
    const k = m / Math.max(0.5, Math.abs(cos))
    return { x: p.x + rx * k, y: p.y, z: p.z + rz * k }
  })
}

/** Metres of road per chevron. */
export const FLOW_PATTERN_M = 16

let flowTex: THREE.Texture | null | undefined
/** White chevrons pointing along +u, on transparent — tinted by nothing, read on any colour. */
function flowTexture(): THREE.Texture | null {
  if (flowTex !== undefined) return flowTex
  flowTex = null
  try {
    const c = document.createElement('canvas')
    c.width = 64; c.height = 32
    const ctx = c.getContext('2d')
    if (ctx) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(22, 6); ctx.lineTo(38, 16); ctx.lineTo(22, 26); ctx.stroke()
      const t = new THREE.CanvasTexture(c)
      t.wrapS = THREE.RepeatWrapping
      t.colorSpace = THREE.SRGBColorSpace
      flowTex = t
    }
  } catch { /* headless */ }
  return flowTex
}

/** GeoJSON rings repeat their first vertex at the end; triangulation must not. */
function openRing(r: ScenePoint[]): ScenePoint[] {
  if (r.length > 1) {
    const a = r[0], b = r[r.length - 1]
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9) return r.slice(0, -1)
  }
  return r
}

/**
 * A horizontal strip of `width` along the line, mitred at the joints (miter
 * capped so a hairpin does not shoot a spike across the map).
 */
function addRibbon(b: GeometryBuilder, line: ScenePoint[], width: number, closed: boolean, patternM = 0): void {
  const pts = closed ? openRing(line) : line
  const n = pts.length
  if (n < 2) return
  const half = width / 2
  const first = b.vertexCount
  let along = 0
  const dir = (i: number, j: number): [number, number] => {
    const dx = pts[j].x - pts[i].x, dz = pts[j].z - pts[i].z
    const l = Math.hypot(dx, dz) || 1
    return [dx / l, dz / l]
  }
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? i - 1 : closed ? n - 1 : -1
    const next = i < n - 1 ? i + 1 : closed ? 0 : -1
    const d0 = prev >= 0 ? dir(prev, i) : dir(i, next)
    const d1 = next >= 0 ? dir(i, next) : d0
    // Bisector normal in plan: perpendicular (−dz, dx) averaged.
    let nx = -(d0[1] + d1[1]), nz = d0[0] + d1[0]
    const nl = Math.hypot(nx, nz)
    if (nl < 1e-6) { nx = -d1[1]; nz = d1[0] } else { nx /= nl; nz /= nl }
    const cos = nx * -d1[1] + nz * d1[0]
    const miter = half / Math.max(0.35, Math.abs(cos))
    const p = pts[i]
    b.push(p.x + nx * miter, p.y, p.z + nz * miter)
    b.push(p.x - nx * miter, p.y, p.z - nz * miter)
    if (patternM > 0) {
      if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z)
      b.uv.push(along / patternM, 1, along / patternM, 0)
    }
  }
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const a = first + i * 2, c = first + ((i + 1) % n) * 2
    b.idx.push(a, a + 1, c, a + 1, c + 1, c)
  }
  b.tag()
}

/** Triangulate in plan (x, z), heights per vertex. */
function addFill(b: GeometryBuilder, rings: ScenePoint[][], y: (p: ScenePoint) => number): void {
  const contour = rings[0].map((p) => new THREE.Vector2(p.x, p.z))
  const holes = rings.slice(1).filter((r) => r.length >= 3).map((r) => r.map((p) => new THREE.Vector2(p.x, p.z)))
  let tris: number[][]
  try { tris = THREE.ShapeUtils.triangulateShape(contour, holes) } catch { return }
  const all = [rings[0], ...rings.slice(1).filter((r) => r.length >= 3)].flat()
  const first = b.vertexCount
  for (const p of all) b.push(p.x, y(p), p.z)
  for (const t of tris) b.idx.push(first + t[0], first + t[1], first + t[2])
  b.tag()
}

/** Walls along every ring + a flat roof. */
function addVolume(b: GeometryBuilder, rings: ScenePoint[][], baseY: number, topY: number): void {
  for (const r of rings) {
    const n = r.length
    for (let i = 0; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n]
      const a = b.push(p.x, baseY, p.z), c = b.push(q.x, baseY, q.z)
      const d = b.push(q.x, topY, q.z), e = b.push(p.x, topY, p.z)
      b.idx.push(a, c, d, a, d, e)
    }
  }
  b.tag()
  addFill(b, rings, () => topY)
}

/** Advance flow chevrons by `dtS` seconds. Called per frame by the layer system. */
export function animateFlow(group: THREE.Object3D, dtS: number): void {
  for (const c of group.children) {
    const speed = c.userData.flowSpeed as number | undefined
    if (!speed) continue
    const map = ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).map
    if (map) map.offset.x = (map.offset.x - (dtS * speed) / FLOW_PATTERN_M) % 1
  }
}
