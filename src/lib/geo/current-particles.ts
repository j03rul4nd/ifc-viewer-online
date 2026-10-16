// ─── current-particles ────────────────────────────────────────────────────────
// The CURRENT of the rivers, drawn on the map: specks of foam drifting
// downstream at the water's own level. A river and a canal look the same as
// flat blue polygons; moving water does not — the drift says which way it
// flows and roughly how fast, and still water (a lake, a dock) stays still.
//
// Built for every device. Each speck loops along a short reach of its course
// with a phase of its own, entirely in the vertex shader: the only thing that
// changes per frame is one uniform, the time. No per-frame CPU work, no
// buffer uploads; the count is capped lower on touch devices, and the layer
// draws nothing when the water layer is hidden (it is a child of it).
//
// Speeds come from the class of the course (wide river ~1 m/s, canal ~0.35,
// stream ~0.6), shown SPED UP so that metre-a-second water reads from a
// district-wide view; the ratio between courses is kept.
//
// THE SEA. OpenStreetMap says where the coast is, not which way the water
// moves along it, and inventing a longshore direction would be worse than
// drawing none. What every coast does have is a tidal stream that runs along
// the shore and back with the tide, as strong as the coast's typical current
// (water-exposure SEA_CURRENT): so the specks off a coast swing to and fro
// parallel to it — a wide swing on a macrotidal coast or an estuary, a
// shiver on the Mediterranean. A wide river on a tidal coast (an estuary
// reach like the Huangpu) swings the same way instead of only running down.

import * as THREE from 'three'
import type { OsmFeature } from './osm-features'
import { latLonToNormalized } from './geo-math'
import { groundFrameFor, waterLevelM, waterSurfacesFor, type LayerMeshOptions } from './osm-scene'
import { SEA_CURRENT } from './water-exposure'
import { coastProfileAt } from '../../features/flood/core/coastal'

/** Visual speed-up over the real current (see header). */
export const CURRENT_SPEEDUP = 25
const REACH_M = 60
/** One speck per this many m² of channel. */
const DENSITY_M2 = 90
/** The tide's swing shown in this many seconds (the real one takes 12 h 25 min). */
export const TIDE_SWING_S = 40
/** Width of the band off the coast where the specks swing, m. */
const SEA_BAND_M = 140

export function currentSpeedMS(widthM: number): number {
  return widthM >= 15 ? 0.9 : widthM >= 8 ? 0.35 : 0.6
}

function maxParticles(): number {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return 1500
  } catch { /* not a browser */ }
  return 5000
}

/** Seeded so the specks do not reshuffle on every rebuild. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000 }
}

const VERT = /* glsl */`
attribute vec3 aA;
attribute vec3 aB;
attribute float aPhase;
attribute float aRate;
// 0 = drift downstream (a river), 1 = swing with the tide (estuary),
// 2 = the sea: swing with the tide, or — with a live current — drift with it.
attribute float aMode;
uniform float uTime;
// The sea's live current (marine-feed), when there is one: direction in the
// map's plane, the drift's rate (cycles/s) and its length (map units).
uniform float uLive;
uniform vec2 uSeaDir;
uniform float uSeaRate;
uniform float uSeaLen;
uniform float uWorldSize;
uniform float uViewportH;
uniform float uPixelRatio;
uniform float uPull;
varying float vFade;
void main() {
  vec3 p;
  if (aMode > 1.5 && uLive > 0.5) {
    // The real current: every speck drifts the same way, looping over a
    // short run about its place, like the river's.
    float g = fract(aPhase * 7.0 + uTime * uSeaRate);
    p = 0.5 * (aA + aB) + vec3(uSeaDir * (g - 0.5) * uSeaLen, 0.0);
    vFade = 0.35 + 0.65 * sin(3.14159265 * g);
  } else {
    float f = aMode < 0.5
      ? fract(aPhase + uTime * aRate)
      : 0.5 + 0.5 * sin(6.2831853 * aPhase + uTime * aRate);
    p = mix(aA, aB, f);
    // Never fully out: a speck that vanishes for half its life reads as noise.
    vFade = aMode < 0.5 ? 0.35 + 0.65 * sin(3.14159265 * f) : 0.75;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Pulled uPull scene metres toward the eye along its own line of sight:
  // the same place on screen, a few metres ahead in depth. The surface a
  // speck floats on — a coarse DEM's drape over the sea reads a metre or
  // three above the water — no longer wins the depth test; a building in
  // front is tens of metres closer and still hides it.
  float dist = length(mv.xyz);
  mv.xyz *= max(0.0, dist - uPull) / max(dist, 1e-6);
  gl_Position = projectionMatrix * mv;
  // A speck of foam about uWorldSize across, in pixels at its distance —
  // legible from a district-wide view, not a blot up close.
  float px = uWorldSize * projectionMatrix[1][1] * 0.5 * uViewportH / max(-mv.z, 1e-12);
  gl_PointSize = clamp(px, 2.5 * uPixelRatio, 10.0 * uPixelRatio);
}
`
const FRAG = /* glsl */`
varying float vFade;
uniform float uOpacity;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  gl_FragColor = vec4(vec3(0.92, 0.97, 1.0), vFade * uOpacity * (1.0 - smoothstep(0.25, 0.5, r)));
}
`

/**
 * The drifting specks for every watercourse drawn from a centreline, at the
 * level the network gives its surface (waterSurfacesFor). Null when there is
 * no flowing water.
 */
export function buildCurrentParticles(
  features: ReadonlyArray<OsmFeature>, opts: LayerMeshOptions,
): THREE.Points | null {
  const courses = features.filter((f) => f.kind === 'water' && f.waterCourse && f.waterCourse.line.length >= 2)
  const seas = features.filter((f) => f.kind === 'water' && f.isSea && f.ring && f.ring.length >= 3)
  if (courses.length === 0 && seas.length === 0) return null
  const coast = coastProfileAt(opts.anchorLat, opts.anchorLon ?? 0)
  const tidalCurrent = SEA_CURRENT[coast.kind].typical
  const tidalCoast = coast.springRangeM >= 1.5
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN
  const levels = waterSurfacesFor(features, frame)

  // The surface a speck must sit ON is the highest water drawn at its point.
  // A riverbank polygon lies level at the floor of its banks, which over a
  // sloping river is above the centreline's own level — specks at the
  // centreline's level were hidden under it.
  const areas = features
    .filter((f) => f.kind === 'water' && !f.waterCourse && !f.waterJoin && f.ring && f.ring.length >= 3)
    .map((f) => {
      const ring = f.ring!.map((p) => { const n = latLonToNormalized(p.lat, p.lon); return new THREE.Vector2(n.nx, n.ny) })
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const v of ring) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y) }
      const flat = levels.get(f.id)
      return { ring, x0, x1, y0, y1, level: flat ?? (() => { const l = waterLevelM(ring, frame, f.isSea === true); return () => l })() }
    })
  const surfaceAt = (own: (nx: number, ny: number) => number, x: number, y: number): number => {
    // What is SEEN there may be the terrain, not the water: a coarse DEM reads
    // metres above the sea over open water, and draws its drape on top of the
    // water mesh. A speck under it is invisible, so it rides the higher of the two.
    let lv = Math.max(own(x, y), frame.groundM(x, y))
    for (const a of areas) {
      if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) continue
      if (inRing(x, y, a.ring)) lv = Math.max(lv, a.level(x, y))
    }
    return lv
  }

  // Reaches first, then share the budget out by channel area.
  interface Reach {
    a: { x: number; y: number }; b: { x: number; y: number }; lenM: number; widthM: number
    level: (nx: number, ny: number) => number
    /** 0 drift, 1 tidal swing; for a swing, `offsetM` is the band's distance from the line. */
    mode: 0 | 1; offsetM?: [number, number]; swingM?: number
  }
  const reaches: Reach[] = []
  for (const f of courses) {
    const level = levels.get(f.id)
    if (!level) continue
    const w = f.waterCourse!.widthM
    // A wide river on a tidal coast is a tidal reach: it swings with the tide.
    const estuary = tidalCoast && w >= 150
    const pts = f.waterCourse!.line.map((p) => { const n = latLonToNormalized(p.lat, p.lon); return { x: n.nx, y: n.ny } })
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i]
      const segM = Math.hypot(q.x - p.x, q.y - p.y) / mToN
      const n = Math.max(1, Math.ceil(segM / REACH_M))
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n
        reaches.push({
          a: { x: p.x + (q.x - p.x) * t0, y: p.y + (q.y - p.y) * t0 },
          b: { x: p.x + (q.x - p.x) * t1, y: p.y + (q.y - p.y) * t1 },
          lenM: segM / n, widthM: w, level,
          mode: estuary ? 1 : 0, swingM: estuary ? swingOf(Math.max(tidalCurrent, 0.6)) : undefined,
        })
      }
    }
  }
  // The coast: the sea's edges that are shoreline — not the box it was closed
  // against, nor a tile's straight seam (both run exactly along a meridian or
  // a parallel; a real coast practically never does for long).
  for (const f of seas) {
    const ring = f.ring!.map((p) => { const n = latLonToNormalized(p.lat, p.lon); return { x: n.nx, y: n.ny } })
    const level = levels.get(f.id) ?? (() => {
      const l = waterLevelM(ring.map((v) => new THREE.Vector2(v.x, v.y)), frame, true)
      return () => l
    })()
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]
      const dx = q.x - p.x, dy = q.y - p.y
      const segM = Math.hypot(dx, dy) / mToN
      if (segM < 1) continue
      const straight = Math.abs(dx) < 1e-12 || Math.abs(dy) < 1e-12
      if (straight && segM > 20) continue
      const n = Math.max(1, Math.ceil(segM / REACH_M))
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n
        reaches.push({
          a: { x: p.x + dx * t0, y: p.y + dy * t0 }, b: { x: p.x + dx * t1, y: p.y + dy * t1 },
          lenM: segM / n, widthM: SEA_BAND_M, level, mode: 1,
          offsetM: [12, SEA_BAND_M], swingM: swingOf(tidalCurrent),
        })
      }
    }
  }
  if (reaches.length === 0) return null
  const seaRings = seas.map((f) => f.ring!.map((p) => { const n = latLonToNormalized(p.lat, p.lon); return { x: n.nx, y: n.ny } }))
  const inSea = (x: number, y: number) => seaRings.some((r) => inRing(x, y, r))
  const area = reaches.reduce((s, r) => s + r.lenM * r.widthM, 0)
  const budget = Math.min(maxParticles(), Math.max(50, Math.round(area / DENSITY_M2)))
  const scale = budget / Math.max(1, area / DENSITY_M2)

  const origin = reaches[0].a
  const A: number[] = [], B: number[] = [], phase: number[] = [], rate: number[] = [], mode: number[] = []
  const rand = rng(courses.length * 7919 + reaches.length)
  // Above the water surface, which itself stands 0.15 m off its level
  // (osm-scene LIFT_M) — at 0.12 the specks were drawn under it.
  const lift = 0.35
  for (const r of reaches) {
    const want = (r.lenM * r.widthM / DENSITY_M2) * scale
    // Carry the fraction so thin streams still get their share across reaches.
    const count = Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0)
    if (count === 0) continue
    const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y
    const len = Math.hypot(dx, dy) || 1
    let nx = -dy / len, ny = dx / len
    const ux = dx / len, uy = dy / len
    const speed = (currentSpeedMS(r.widthM) * CURRENT_SPEEDUP) / Math.max(1, r.lenM)
    if (r.mode === 1 && r.offsetM) {
      // Seaward: the side of the edge the sea is on.
      const mx = (r.a.x + r.b.x) / 2, my = (r.a.y + r.b.y) / 2
      if (!inSea(mx + nx * 20 * mToN, my + ny * 20 * mToN)) { nx = -nx; ny = -ny }
      for (let k = 0; k < count; k++) {
        const along = rand()
        const off = (r.offsetM[0] + (r.offsetM[1] - r.offsetM[0]) * rand() ** 1.5) * mToN
        const cx = r.a.x + dx * along + nx * off, cy = r.a.y + dy * along + ny * off
        if (!inSea(cx, cy)) continue
        const half = (r.swingM! / 2) * mToN
        const ax = cx - ux * half, ay = cy - uy * half, bx = cx + ux * half, by = cy + uy * half
        const lv = surfaceAt(r.level, cx, cy)
        const z = frame.zAtElevationM(lv + lift)
        A.push(ax - origin.x, ay - origin.y, z)
        B.push(bx - origin.x, by - origin.y, z)
        // Everything off one coast swings together, as a tide does — with a
        // little jitter so the band does not move like one rigid sheet.
        phase.push(rand() * 0.08)
        rate.push((2 * Math.PI) / TIDE_SWING_S)
        mode.push(2)
      }
      continue
    }
    for (let k = 0; k < count; k++) {
      // Across the channel, denser toward the middle where the current is.
      const off = (rand() + rand() - 1) * 0.42 * r.widthM * mToN
      const ax = r.a.x + nx * off, ay = r.a.y + ny * off
      const bx = r.b.x + nx * off, by = r.b.y + ny * off
      const za = frame.zAtElevationM(surfaceAt(r.level, ax, ay) + lift)
      const zb = frame.zAtElevationM(surfaceAt(r.level, bx, by) + lift)
      A.push(ax - origin.x, ay - origin.y, za)
      B.push(bx - origin.x, by - origin.y, zb)
      if (r.mode === 1) {
        // An estuary reach: swing along the channel about the speck's place.
        const mxp = (ax + bx) / 2, myp = (ay + by) / 2, half = (r.swingM! / 2) * mToN
        const zc = frame.zAtElevationM(surfaceAt(r.level, mxp, myp) + lift)
        A.splice(A.length - 3, 3, mxp - ux * half - origin.x, myp - uy * half - origin.y, zc)
        B.splice(B.length - 3, 3, mxp + ux * half - origin.x, myp + uy * half - origin.y, zc)
        phase.push(rand() * 0.08)
        rate.push((2 * Math.PI) / TIDE_SWING_S)
        mode.push(1)
        continue
      }
      phase.push(rand())
      // A little spread so specks on one reach do not march in step.
      rate.push(speed * (0.75 + 0.5 * rand()))
      mode.push(0)
    }
  }
  const n = phase.length
  if (n === 0) return null
  const geometry = new THREE.BufferGeometry()
  // Points need a position for culling and bounds: the reach's start.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(A, 3))
  geometry.setAttribute('aA', new THREE.Float32BufferAttribute(A, 3))
  geometry.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1))
  geometry.setAttribute('aRate', new THREE.Float32BufferAttribute(rate, 1))
  geometry.setAttribute('aMode', new THREE.Float32BufferAttribute(mode, 1))
  geometry.computeBoundingSphere()

  const uniforms = {
    uTime: { value: 0 },
    // In SCENE metres: the model-view matrix already carries the map's scale.
    uWorldSize: { value: 1.6 },
    uViewportH: { value: 800 },
    uPull: { value: 4 },
    uLive: { value: 0 },
    uSeaDir: { value: new THREE.Vector2(1, 0) },
    uSeaRate: { value: 0 },
    uSeaLen: { value: REACH_M * mToN },
    uOpacity: { value: 0.95 },
    uPixelRatio: { value: typeof devicePixelRatio === 'number' ? Math.min(2, devicePixelRatio) : 1 },
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false,
  })
  // The map's RAF advances `uTime` on every material flagged like this (setSurfaceTime).
  material.userData.animated = true
  material.userData.uniforms = uniforms
  const points = new THREE.Points(geometry, material)
  // The drawing buffer's height, for the size in pixels: read at draw time,
  // so a resize or a rotated phone is followed with no listener.
  points.onBeforeRender = (renderer) => { uniforms.uViewportH.value = renderer.domElement.height }
  points.position.set(origin.x, origin.y, 0)
  points.name = 'current-particles'
  points.userData.mToN = mToN
  points.renderOrder = 3
  points.frustumCulled = true
  return points
}

/**
 * How far a speck swings along the shore, m: a sense of the tidal stream's
 * strength, not its real excursion (kilometres over half a tide).
 */
function swingOf(currentMS: number): number {
  return Math.max(4, Math.min(70, currentMS * 45))
}

function inRing(x: number, y: number, ring: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * The sea's specks follow a LIVE current (marine-feed) — or, with null, go
 * back to swinging with the coast's typical tide. Uniforms only: no rebuild,
 * so it can follow the current hour by hour.
 */
export function setLiveCurrent(points: THREE.Points, live: { currentMS: number; currentToDeg: number } | null): void {
  const u = (points.material as THREE.ShaderMaterial).uniforms
  if (!u?.uLive) return
  if (!live || !Number.isFinite(live.currentMS) || !Number.isFinite(live.currentToDeg)) { u.uLive.value = 0; return }
  const a = (live.currentToDeg * Math.PI) / 180
  // Normalized Web Mercator: +x east, +y north.
  ;(u.uSeaDir.value as THREE.Vector2).set(Math.sin(a), Math.cos(a))
  u.uSeaRate.value = (Math.max(0.02, live.currentMS) * CURRENT_SPEEDUP) / REACH_M
  u.uLive.value = 1
}
