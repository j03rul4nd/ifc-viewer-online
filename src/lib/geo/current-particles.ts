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

import * as THREE from 'three'
import type { OsmFeature } from './osm-features'
import { latLonToNormalized } from './geo-math'
import { groundFrameFor, waterLevelM, waterSurfacesFor, type LayerMeshOptions } from './osm-scene'

/** Visual speed-up over the real current (see header). */
export const CURRENT_SPEEDUP = 25
const REACH_M = 60
/** One speck per this many m² of channel. */
const DENSITY_M2 = 90

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
uniform float uTime;
uniform float uWorldSize;
uniform float uViewportH;
uniform float uPixelRatio;
varying float vFade;
void main() {
  float f = fract(aPhase + uTime * aRate);
  vec3 p = mix(aA, aB, f);
  // Never fully out: a speck that vanishes for half its life reads as noise.
  vFade = 0.35 + 0.65 * sin(3.14159265 * f);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
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
  if (courses.length === 0) return null
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
    let lv = own(x, y)
    for (const a of areas) {
      if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) continue
      if (inRing(x, y, a.ring)) lv = Math.max(lv, a.level(x, y))
    }
    return lv
  }

  // Reaches first, then share the budget out by channel area.
  interface Reach { a: { x: number; y: number }; b: { x: number; y: number }; lenM: number; widthM: number; level: (nx: number, ny: number) => number }
  const reaches: Reach[] = []
  for (const f of courses) {
    const level = levels.get(f.id)
    if (!level) continue
    const w = f.waterCourse!.widthM
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
        })
      }
    }
  }
  if (reaches.length === 0) return null
  const area = reaches.reduce((s, r) => s + r.lenM * r.widthM, 0)
  const budget = Math.min(maxParticles(), Math.max(50, Math.round(area / DENSITY_M2)))
  const scale = budget / Math.max(1, area / DENSITY_M2)

  const origin = reaches[0].a
  const A: number[] = [], B: number[] = [], phase: number[] = [], rate: number[] = []
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
    const nx = -dy / len, ny = dx / len
    const speed = (currentSpeedMS(r.widthM) * CURRENT_SPEEDUP) / Math.max(1, r.lenM)
    for (let k = 0; k < count; k++) {
      // Across the channel, denser toward the middle where the current is.
      const off = (rand() + rand() - 1) * 0.42 * r.widthM * mToN
      const ax = r.a.x + nx * off, ay = r.a.y + ny * off
      const bx = r.b.x + nx * off, by = r.b.y + ny * off
      const za = frame.zAtElevationM(surfaceAt(r.level, ax, ay) + lift)
      const zb = frame.zAtElevationM(surfaceAt(r.level, bx, by) + lift)
      A.push(ax - origin.x, ay - origin.y, za)
      B.push(bx - origin.x, by - origin.y, zb)
      phase.push(rand())
      // A little spread so specks on one reach do not march in step.
      rate.push(speed * (0.75 + 0.5 * rand()))
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
  geometry.computeBoundingSphere()

  const uniforms = {
    uTime: { value: 0 },
    // In SCENE metres: the model-view matrix already carries the map's scale.
    uWorldSize: { value: 1.6 },
    uViewportH: { value: 800 },
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
  points.renderOrder = 3
  points.frustumCulled = true
  return points
}

function inRing(x: number, y: number, ring: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
