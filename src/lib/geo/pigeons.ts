// ─── pigeons ──────────────────────────────────────────────────────────────────
// THE BIRDS OF A CITY SQUARE.
//
// Invented scenery, like the parked cars: nothing in OpenStreetMap maps a
// pigeon, so they ride the `scenery` switch and are never presented as data.
// What IS read from the map is where they belong — a paved pedestrian square
// large enough to be a square, off its lawns and out of its fountains.
//
// Two kinds, two instanced meshes, one material family:
//
//   - FLOCKS ON THE GROUND, a handful per square, a dozen birds each, pecking
//     at their own rhythm — what anybody remembers of Plaça de Catalunya;
//   - ONE FLOCK IN THE AIR over the biggest square, wheeling in a wide circle
//     with its wings beating.
//
// All the motion is in the vertex shader off one time uniform, the same one
// the water uses (`setSurfaceTime`), so a hundred and fifty birds cost two draw
// calls and no work on the main thread per frame.
//
// Sizes are a real rock dove's: 32 cm beak to tail, 64 cm across the wings.

import * as THREE from 'three'
import { latLonToNormalized } from './geo-math'
import { hashId } from './feature-variation'
import { createGroundFrame } from './ground-frame'
import { applyGroundDepthNudge } from './ground-depth-nudge'
import { isPedestrianFloor, islandsInFloor } from './plaza-paving'
import { pointInLatLonRing, type LatLonPoint, type OsmFeature } from './osm-features'

export interface PigeonOptions {
  anchorLat: number
  anchorLon?: number
  anchorElevationM?: number
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  exaggeration?: number
}

/** A square smaller than this is a forecourt, and gets no flock. */
export const PIGEON_MIN_SQUARE_M2 = 2500
/** Ground flocks per square, at most, however large. */
const MAX_FLOCKS_PER_SQUARE = 7
/** Ground flocks across the whole scene, at most. */
const MAX_GROUND_FLOCKS = 24
/** Birds in the airborne flock. */
const AIR_FLOCK = 22
/**
 * Height of the paving above the bare ground, metres: the road layer's base
 * lift less the paved-area offset (see LINEAR_LIFT_M and PAVED_AREA_LIFT_M in
 * osm-scene). A bird stood on the DEM would be ankle-deep in the square.
 */
const PAVING_ABOVE_GROUND_M = 0.22

/** Deterministic 0..1 stream from a string seed (mulberry32). */
function rng(seed: string): () => number {
  let a = hashId(seed) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function areaM2(ring: ReadonlyArray<LatLonPoint>): number {
  const k = Math.cos((ring[0].lat * Math.PI) / 180)
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].lon * k * ring[i].lat - ring[i].lon * k * ring[j].lat
  }
  return Math.abs(a / 2) * 111_320 ** 2
}

export interface PigeonSpot { lat: number; lon: number; yawRad: number; phase: number }
export interface PigeonPlan { ground: PigeonSpot[]; air: { lat: number; lon: number; radiusM: number; heightM: number; birds: number } | null }

/**
 * Where the birds go. Pure: features in, positions out.
 *
 * A flock is dropped only where its CENTRE is on open paving — inside the
 * square, outside every lawn and pool set into it — and each bird of the flock
 * is kept only if it is too, so no pigeon stands in a fountain.
 */
export function planPigeons(features: ReadonlyArray<OsmFeature>): PigeonPlan {
  const squares = features
    .filter(isPedestrianFloor)
    .map((f) => ({ f, area: areaM2(f.ring!) }))
    .filter((s) => s.area >= PIGEON_MIN_SQUARE_M2)
    .sort((a, b) => b.area - a.area)
  const cover = features.filter((f) => (f.kind === 'green' || f.kind === 'water') && f.ring && !f.isSea)
  const blocked = features.filter((f) => (f.kind === 'building' || f.kind === 'barrier') && f.ring && f.ring.length >= 3)

  const ground: PigeonSpot[] = []
  let flocks = 0
  for (const { f, area } of squares) {
    if (flocks >= MAX_GROUND_FLOCKS) break
    const ring = f.ring!
    const holes = [...(f.holes ?? []), ...islandsInFloor(f, cover)]
    let minLat = Infinity; let maxLat = -Infinity; let minLon = Infinity; let maxLon = -Infinity
    for (const p of ring) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon)
    }
    const open = (p: LatLonPoint): boolean => pointInLatLonRing(p, ring)
      && !holes.some((h) => h.length >= 3 && pointInLatLonRing(p, h))
      && !blocked.some((b) => b.kind === 'building' && pointInLatLonRing(p, b.ring!))
    const rand = rng(`pigeons:${f.id}`)
    const want = Math.min(MAX_FLOCKS_PER_SQUARE, Math.max(1, Math.floor(area / 2500)))
    const mPerLat = 111_320
    const mPerLon = 111_320 * Math.cos((ring[0].lat * Math.PI) / 180)
    for (let tries = 0, made = 0; made < want && tries < want * 25 && flocks < MAX_GROUND_FLOCKS; tries++) {
      const centre = { lat: minLat + rand() * (maxLat - minLat), lon: minLon + rand() * (maxLon - minLon) }
      if (!open(centre)) continue
      made++; flocks++
      const birds = 6 + Math.floor(rand() * 13)
      // A flock faces roughly one way — into the wind, or toward whoever is
      // throwing bread — with each bird a little off it.
      const facing = rand() * Math.PI * 2
      for (let b = 0; b < birds; b++) {
        const r = 2.6 * Math.sqrt(rand())
        const a = rand() * Math.PI * 2
        const spot = { lat: centre.lat + (Math.sin(a) * r) / mPerLat, lon: centre.lon + (Math.cos(a) * r) / mPerLon }
        if (!open(spot)) continue
        ground.push({ ...spot, yawRad: facing + (rand() - 0.5) * 1.8, phase: rand() * 100 })
      }
    }
  }

  let air: PigeonPlan['air'] = null
  if (squares.length) {
    const ring = squares[0].f.ring!
    let lat = 0; let lon = 0
    for (const p of ring) { lat += p.lat; lon += p.lon }
    const radiusM = Math.min(45, Math.max(14, Math.sqrt(squares[0].area) * 0.22))
    air = { lat: lat / ring.length, lon: lon / ring.length, radiusM, heightM: 16, birds: AIR_FLOCK }
  }
  return { ground, air }
}

// ── Geometry ──────────────────────────────────────────────────────────────────

const PLUMAGE = new THREE.Color(0.47, 0.49, 0.55)
const PLUMAGE_DARK = new THREE.Color(0.30, 0.31, 0.36)
const NECK = new THREE.Color(0.30, 0.42, 0.40)
const PALE = new THREE.Color(0.68, 0.70, 0.74)
const BEAK = new THREE.Color(0.32, 0.27, 0.25)

/**
 * One rock dove, low-poly, metres. +x forward, +y left, +z up, feet at z = 0.
 * `aWing` is how far out along a wing a vertex is (0 on the body): the shader
 * beats the wings by it. `aHead` is 1 on the head, which the shader dips to peck.
 */
export function pigeonGeometry(withWings: boolean): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const wing: number[] = []
  const head: number[] = []
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color, w = [0, 0, 0], h = 0) => {
    pos.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i++) { col.push(color.r, color.g, color.b); head.push(h) }
    wing.push(...w)
  }
  // Body: a diamond-section spindle, breast at the front, tail behind.
  const ring = (x: number, w: number, zMid: number, hh: number) => [
    [x, 0, zMid + hh], [x, w, zMid], [x, 0, zMid - hh], [x, -w, zMid],
  ]
  const sections = [ring(0.10, 0.045, 0.15, 0.05), ring(0.02, 0.06, 0.13, 0.065), ring(-0.08, 0.045, 0.12, 0.045)]
  const breast = [0.15, 0, 0.15]
  const tail = [-0.20, 0, 0.12]
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4
    const top = k === 0 || k === 3
    tri(breast, sections[0][n], sections[0][k], k === 2 || k === 1 ? PALE : PLUMAGE)
    for (let s = 0; s < 2; s++) {
      const a = sections[s]; const b = sections[s + 1]
      const c = top ? PLUMAGE : PALE
      tri(a[k], a[n], b[n], c); tri(a[k], b[n], b[k], c)
    }
    tri(sections[2][k], sections[2][n], tail, PLUMAGE_DARK)
  }
  // Tail fan.
  tri([-0.10, 0.035, 0.125], [-0.10, -0.035, 0.125], [-0.22, 0, 0.115], PLUMAGE_DARK)
  tri([-0.22, 0, 0.115], [-0.25, 0.05, 0.115], [-0.25, -0.05, 0.115], PLUMAGE_DARK)
  // Head and neck (the iridescent collar), with a beak.
  const h = 1
  const crown = [0.15, 0, 0.27]; const nape = [0.11, 0, 0.23]
  const cheekL = [0.15, 0.025, 0.235]; const cheekR = [0.15, -0.025, 0.235]
  const bill = [0.205, 0, 0.235]; const throat = [0.14, 0, 0.19]
  tri(nape, cheekL, crown, PLUMAGE, [0, 0, 0], h); tri(nape, crown, cheekR, PLUMAGE, [0, 0, 0], h)
  tri(crown, cheekL, bill, PLUMAGE, [0, 0, 0], h); tri(crown, bill, cheekR, PLUMAGE, [0, 0, 0], h)
  tri(cheekL, throat, bill, NECK, [0, 0, 0], h); tri(cheekR, bill, throat, NECK, [0, 0, 0], h)
  tri(nape, throat, cheekL, NECK, [0, 0, 0], h); tri(nape, cheekR, throat, NECK, [0, 0, 0], h)
  tri([0.205, 0.006, 0.236], [0.205, -0.006, 0.236], [0.235, 0, 0.232], BEAK, [0, 0, 0], h)
  // Neck to body.
  tri(nape, [0.10, 0.04, 0.17], throat, NECK); tri(nape, throat, [0.10, -0.04, 0.17], NECK)
  // Legs: two thin red-brown wedges.
  const leg = new THREE.Color(0.55, 0.30, 0.28)
  for (const y of [0.02, -0.02]) {
    tri([0.03, y, 0.10], [0.01, y, 0.10], [0.03, y, 0.0], leg)
    tri([0.06, y, 0.0], [0.0, y, 0.0], [0.03, y, 0.01], leg)
  }
  if (withWings) {
    // Spread wings for flight, each two panels: arm and hand. The bars on a
    // rock dove's wing are its signature; the tips are dark.
    for (const side of [1, -1]) {
      const root0 = [0.06, 0.045 * side, 0.15]; const root1 = [-0.08, 0.04 * side, 0.14]
      const mid0 = [0.05, 0.17 * side, 0.155]; const mid1 = [-0.07, 0.17 * side, 0.15]
      const tip = [-0.02, 0.32 * side, 0.155]
      tri(root0, mid0, mid1, PLUMAGE, [0, 0.5, 0.5]); tri(root0, mid1, root1, PLUMAGE, [0, 0.5, 0])
      tri(mid0, tip, mid1, PLUMAGE_DARK, [0.5, 1, 0.5])
    }
  } else {
    // Folded wings: dark bars along the back.
    for (const side of [1, -1]) {
      tri([0.06, 0.05 * side, 0.165], [-0.06, 0.05 * side, 0.16], [-0.16, 0.02 * side, 0.135], PLUMAGE_DARK)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1))
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1))
  g.computeVertexNormals()
  return g
}

// ── Material ──────────────────────────────────────────────────────────────────

/** Motion, all in the bird's own metres before the instance matrix places it. */
const PIGEON_VERTEX = /* glsl */ `
#ifdef PIGEON_FLYING
  // Wheel round the flock's centre: angle from time and the bird's place in
  // the flock, a little height and radius of its own, wings beating.
  float ang = uTime * aSpeed + aPhase;
  float rad = aOrbit.x + sin(uTime * 0.31 + aPhase * 3.0) * 2.5;
  float hgt = aOrbit.y + sin(uTime * 0.53 + aPhase * 5.0) * 1.6;
  float flap = sin(uTime * 13.0 + aPhase * 7.0);
  transformed.z += aWing * flap * 0.16;
  transformed.y *= 1.0 - aWing * abs(flap) * 0.15;
  // Face along the circle (counter-clockwise: heading is the angle + 90°).
  float hd = ang + 1.5707963;
  transformed.xy = vec2(cos(hd) * transformed.x - sin(hd) * transformed.y,
                        sin(hd) * transformed.x + cos(hd) * transformed.y);
  transformed += vec3(cos(ang) * rad, sin(ang) * rad, hgt);
#else
  // Peck: the head drops and forward in short bursts, each bird on its own beat.
  float beat = max(0.0, sin(uTime * 2.6 + aPhase));
  float peck = pow(beat, 6.0) * step(0.35, fract(aPhase * 0.173 + floor(uTime * 0.4 + aPhase) * 0.618));
  transformed.z -= aHead * peck * 0.09;
  transformed.x += aHead * peck * 0.035;
  // And the bob of a walking dove.
  transformed.z += sin(uTime * 5.2 + aPhase) * 0.004;
#endif
`

function pigeonMaterial(flying: boolean, time: { value: number }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
  if (flying) material.defines = { PIGEON_FLYING: '' }
  const uniforms = { uTime: time }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
attribute float aWing;
attribute float aHead;
attribute float aPhase;
${flying ? 'attribute float aSpeed;\nattribute vec2 aOrbit;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PIGEON_VERTEX}`)
  }
  material.customProgramCacheKey = () => `pigeon-${flying ? 'air' : 'ground'}`
  material.name = `pigeon-${flying ? 'air' : 'ground'}`
  // The map's frame loop advances uTime on every material flagged like this.
  material.userData.animated = true
  material.userData.uniforms = uniforms
  // Small and standing on paving that is pulled toward the eye: pulled the
  // same way, or the square paints over their feet from across the square.
  return applyGroundDepthNudge(material)
}

// ── Layer ─────────────────────────────────────────────────────────────────────

/** The birds of every square in the scene, or null when there is no square. */
export function buildPigeonLayer(
  features: ReadonlyArray<OsmFeature>, opts: PigeonOptions,
): { object: THREE.Group; count: number } | null {
  const plan = planPigeons(features)
  if (plan.ground.length === 0 && !plan.air) return null
  const frame = createGroundFrame({
    anchorLat: opts.anchorLat, anchorElevationM: opts.anchorElevationM,
    sampleGroundM: opts.sampleGroundM, exaggeration: opts.exaggeration,
  })
  const mToN = frame.mToN
  const origin = latLonToNormalized(opts.anchorLat, opts.anchorLon ?? 0)
  const time = { value: 0 }
  const group = new THREE.Group()
  group.name = 'osm-pigeons'
  group.position.set(origin.nx, origin.ny, 0)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 0, 1)
  const scale = new THREE.Vector3(mToN, mToN, mToN)

  if (plan.ground.length) {
    const geometry = pigeonGeometry(false)
    const mesh = new THREE.InstancedMesh(geometry, pigeonMaterial(false, time), plan.ground.length)
    const phase = new Float32Array(plan.ground.length)
    plan.ground.forEach((b, i) => {
      const n = latLonToNormalized(b.lat, b.lon)
      const z = frame.groundZ(n.nx, n.ny) + PAVING_ABOVE_GROUND_M * mToN
      q.setFromAxisAngle(up, b.yawRad)
      m.compose(new THREE.Vector3(n.nx - origin.nx, n.ny - origin.ny, z), q, scale)
      mesh.setMatrixAt(i, m)
      phase[i] = b.phase
    })
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    mesh.name = 'osm-pigeons-ground'
    mesh.frustumCulled = false
    group.add(mesh)
  }

  if (plan.air) {
    const a = plan.air
    const geometry = pigeonGeometry(true)
    const mesh = new THREE.InstancedMesh(geometry, pigeonMaterial(true, time), a.birds)
    const n = latLonToNormalized(a.lat, a.lon)
    const z = frame.groundZ(n.nx, n.ny)
    const rand = rng(`pigeons:air:${a.lat.toFixed(5)},${a.lon.toFixed(5)}`)
    const phase = new Float32Array(a.birds)
    const speed = new Float32Array(a.birds)
    const orbit = new Float32Array(a.birds * 2)
    m.compose(new THREE.Vector3(n.nx - origin.nx, n.ny - origin.ny, z), new THREE.Quaternion(), scale)
    for (let i = 0; i < a.birds; i++) {
      mesh.setMatrixAt(i, m)
      // Bunched: most of the flock within a fifth of a turn of its leader.
      phase[i] = (rand() - 0.5) * 1.1 + (i === 0 ? 0 : 0)
      // ~9 m/s round the circle, each a hair different so the flock breathes.
      speed[i] = (9 / a.radiusM) * (0.97 + rand() * 0.06)
      orbit[i * 2] = a.radiusM + (rand() - 0.5) * 6
      orbit[i * 2 + 1] = a.heightM + (rand() - 0.5) * 5
    }
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1))
    geometry.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 2))
    mesh.name = 'osm-pigeons-air'
    mesh.frustumCulled = false
    group.add(mesh)
  }
  return { object: group, count: plan.ground.length + (plan.air?.birds ?? 0) }
}
