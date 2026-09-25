// ─── street-furniture ─────────────────────────────────────────────────────────
// MAPPED street furniture, barriers and signal placement.
//
// Everything here stands where a surveyor put it. What the survey almost never
// says is which way it FACES — 2 of the 80 benches in the Ciutadella box carry
// `direction`, and 63 of 114 signals in the Eixample say which carriageway
// direction they control but none says which kerb they stand on. So the
// position is data and the orientation is inferred from the network around
// it, by rules a person would apply standing there:
//
//   • A bench faces the path it sits beside. Its back is to the lawn, the wall
//     or the building; nobody installs a bench looking at a hedge.
//   • A street lamp stands at the kerb and reaches over the carriageway; a
//     lamp on a park path is a post-top lantern with no arm to point.
//   • A traffic signal node sits ON the carriageway (that is how OSM maps the
//     stop line). The mast stands at the kerb to the RIGHT of the traffic it
//     controls, lenses facing that traffic — and, on a wide one-way street, a
//     second mast at the left kerb, which is exactly what the Eixample does.
//   • A signalised crossing gets a pedestrian head at each kerb, each facing
//     the people waiting on the far side.
//
// Coordinates are LOCAL METRES about the anchor; each output group is placed
// and scaled back into the normalized frame once. That keeps every placement
// sum well away from the float32 cliff a metre is in normalized units.

import * as THREE from 'three'
import { latLonToNormalized } from './geo-math'
import { createGroundFrame } from './ground-frame'
import { hashId, variate } from './feature-variation'
import type { OsmFeature, LatLonPoint } from './osm-features'
import type { SolvedProfile } from './vertical-network'
import { runToEnd, type Steps } from './steps'
import { runSliced, type SliceOptions } from './render-scheduler'

export interface StreetFurnitureOptions {
  anchorLat: number
  anchorLon?: number
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  anchorElevationM?: number
  exaggeration?: number
  /** Authored assets; absent keys fall back to procedural stand-ins. */
  assets?: ReadonlyMap<string, THREE.BufferGeometry> | null
  /** Barcelona's own furniture pattern — its bench, lantern, fountain, bin. */
  barcelona?: boolean
  vertical?: ReadonlyMap<string, SolvedProfile> | null
  /** True where the model stands; nothing is placed inside it. */
  excludeAt?: ((nx: number, ny: number) => boolean) | null
}

type V = { x: number; y: number }

/** A placed instance, local metres, yaw = heading of the asset's +X axis. */
export interface Placed { x: number; y: number; z: number; yaw: number; seed: string }

// ── The network, as segments in local metres ─────────────────────────────────

interface Seg {
  a: V; b: V
  /** Half the way's width, metres. */
  half: number
  vehicular: boolean
  feature: OsmFeature
  /** Vertex index of `a` in the feature's ring. */
  index: number
}

interface Network {
  segs: Seg[]
  /** Nearest segment passing the filter within `r` metres. */
  nearest(p: V, r: number, ok: (s: Seg) => boolean): { seg: Seg; at: V; dist: number; t: number } | null
  /** Carriageway vertices at exactly this surveyed coordinate. */
  vertexAt(ll: LatLonPoint): Array<{ feature: OsmFeature; index: number }>
  /** Inside ANY passing way's width (plus `pad`) — not just the nearest centreline's. */
  within(p: V, pad: number, ok: (s: Seg) => boolean): boolean
}

const CELL_M = 25
const llKey = (p: LatLonPoint): string => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`

function buildNetwork(features: ReadonlyArray<OsmFeature>, toLocal: (p: LatLonPoint) => V): Network {
  const segs: Seg[] = []
  const grid = new Map<string, number[]>()
  const vertices = new Map<string, Array<{ feature: OsmFeature; index: number }>>()
  for (const f of features) {
    if (f.kind !== 'road' || !f.ring || f.widthM === undefined || f.style.crossing) continue
    if (f.vertical?.structure === 'tunnel') continue
    const vehicular = f.style.roadClass === 'vehicular'
    const pts = f.ring.map(toLocal)
    f.ring.forEach((ll, index) => {
      if (!vehicular) return
      const k = llKey(ll)
      const list = vertices.get(k)
      if (list) list.push({ feature: f, index }); else vertices.set(k, [{ feature: f, index }])
    })
    for (let i = 1; i < pts.length; i++) {
      const s: Seg = { a: pts[i - 1], b: pts[i], half: f.widthM / 2, vehicular, feature: f, index: i - 1 }
      const id = segs.push(s) - 1
      const x0 = Math.floor(Math.min(s.a.x, s.b.x) / CELL_M), x1 = Math.floor(Math.max(s.a.x, s.b.x) / CELL_M)
      const y0 = Math.floor(Math.min(s.a.y, s.b.y) / CELL_M), y1 = Math.floor(Math.max(s.a.y, s.b.y) / CELL_M)
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) continue
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = `${gx},${gy}`
        const cell = grid.get(k)
        if (cell) cell.push(id); else grid.set(k, [id])
      }
    }
  }
  return {
    segs,
    nearest(p, r, ok) {
      let best: { seg: Seg; at: V; dist: number; t: number } | null = null
      const reach = Math.ceil(r / CELL_M)
      const cx = Math.floor(p.x / CELL_M), cy = Math.floor(p.y / CELL_M)
      const seen = new Set<number>()
      for (let gx = cx - reach; gx <= cx + reach; gx++) for (let gy = cy - reach; gy <= cy + reach; gy++) {
        for (const id of grid.get(`${gx},${gy}`) ?? []) {
          if (seen.has(id)) continue
          seen.add(id)
          const s = segs[id]
          if (!ok(s)) continue
          const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y
          const len2 = dx * dx + dy * dy
          if (len2 === 0) continue
          const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2))
          const at = { x: s.a.x + dx * t, y: s.a.y + dy * t }
          const dist = Math.hypot(p.x - at.x, p.y - at.y)
          if (dist <= r && (!best || dist < best.dist)) best = { seg: s, at, dist, t }
        }
      }
      return best
    },
    vertexAt(ll) { return vertices.get(llKey(ll)) ?? [] },
    within(p, pad, ok) {
      // The widest carriageway in a Barcelona box is ~45 m; 2 cells reach it.
      const cx = Math.floor(p.x / CELL_M), cy = Math.floor(p.y / CELL_M)
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const id of grid.get(`${gx},${gy}`) ?? []) {
          const s = segs[id]
          if (!ok(s)) continue
          const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y
          const len2 = dx * dx + dy * dy
          if (len2 === 0) continue
          const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2))
          if (Math.hypot(p.x - s.a.x - dx * t, p.y - s.a.y - dy * t) < s.half + pad) return true
        }
      }
      return false
    },
  }
}

const unit = (v: V): V => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l } }
/** Heading of +X for a bearing in degrees clockwise from north. */
const yawOfBearing = (deg: number): number => Math.PI / 2 - (deg * Math.PI) / 180

// ── Furniture placement (pure) ────────────────────────────────────────────────

export type FurnitureSlot =
  | 'bench' | 'bin' | 'fountain' | 'bollard' | 'lamp-street' | 'lamp-park'
  | 'statue' | 'bust' | 'sculpture' | 'slide' | 'springy' | 'swing' | 'pergola'

export interface FurniturePlan { slot: FurnitureSlot; at: Placed }

/**
 * Where each mapped furniture node stands and which way it faces.
 *
 * Exported pure so the orientation rules can be tested without a renderer.
 */
export function planFurniture(
  features: ReadonlyArray<OsmFeature>,
  toLocal: (p: LatLonPoint) => V,
  network?: Network,
): FurniturePlan[] {
  return runToEnd(furniturePlanSteps(features, toLocal, network))
}

/** `planFurniture`, pausable between nodes — see `steps`. */
function* furniturePlanSteps(
  features: ReadonlyArray<OsmFeature>,
  toLocal: (p: LatLonPoint) => V,
  network?: Network,
): Steps<FurniturePlan[]> {
  const net = network ?? buildNetwork(features, toLocal)
  const out: FurniturePlan[] = []
  for (const f of features) {
    if (f.kind !== 'furniture' || !f.point || !f.style.furniture) continue
    yield
    const p = toLocal(f.point)
    const seed = f.id
    const kind = f.style.furniture
    const tagged = f.style.directionDeg !== undefined ? yawOfBearing(f.style.directionDeg) : null

    if (kind === 'bollard') {
      out.push({ slot: 'bollard', at: { ...p, z: 0, yaw: variate(seed, 1) * Math.PI, seed } })
      continue
    }

    if (kind === 'street_lamp') {
      // Wall lamps hang off a facade: a column there would stand in a doorway.
      if (f.style.lampMount === 'wall' || f.style.lampMount === 'suspended') continue
      const road = net.nearest(p, 14, (s) => s.vehicular)
      if (road && road.dist <= road.seg.half + 6) {
        // Kerbside, arm across the carriageway. A lamp surveyed INSIDE the
        // carriageway (a centreline tap) is moved out to the nearer kerb.
        const side = sideOf(p, road)
        const n = normalOf(road.seg, side)
        const off = Math.max(road.dist, road.seg.half + 0.6)
        const at = { x: road.at.x + n.x * off, y: road.at.y + n.y * off }
        out.push({ slot: 'lamp-street', at: { ...at, z: 0, yaw: Math.atan2(-n.y, -n.x), seed } })
      } else {
        const path = net.nearest(p, 10, () => true)
        const yaw = tagged ?? (path ? Math.atan2(path.at.y - p.y, path.at.x - p.x) : variate(seed, 2) * Math.PI * 2)
        out.push({ slot: 'lamp-park', at: { ...p, z: 0, yaw, seed } })
      }
      continue
    }

    // Statues, play equipment, pergolas: they stand where they were surveyed
    // — a statue is never nudged — and turn to face the nearest path, which is
    // where the plinth's inscription and the slide's ladder always are.
    if (kind === 'artwork' || kind === 'playground' || kind === 'shelter') {
      const slot: FurnitureSlot | null = kind === 'artwork' ? (f.style.artwork ?? null)
        : kind === 'playground' ? (f.style.play ?? null) : 'pergola'
      if (!slot) continue
      if (tagged !== null) { out.push({ slot, at: { ...p, z: 0, yaw: tagged, seed } }); continue }
      const path = net.nearest(p, 25, (s) => !s.vehicular) ?? net.nearest(p, 40, () => true)
      const yaw = path && path.dist > 0.2
        ? Math.atan2(path.at.y - p.y, path.at.x - p.x)
        : variate(seed, 4) * Math.PI * 2
      out.push({ slot, at: { ...p, z: 0, yaw, seed } })
      continue
    }

    // Bench, bin, fountain: face the way they serve.
    const slot: FurnitureSlot = kind === 'bench' ? 'bench' : kind === 'waste_basket' ? 'bin' : 'fountain'
    if (tagged !== null) { out.push({ slot, at: { ...p, z: 0, yaw: tagged, seed } }); continue }
    // Paths first: a park bench beside a footway faces the footway, not the
    // avenue beyond the railings.
    const path = net.nearest(p, 9, (s) => !s.vehicular) ?? net.nearest(p, 14, () => true)
    if (!path) { out.push({ slot, at: { ...p, z: 0, yaw: variate(seed, 3) * Math.PI * 2, seed } }); continue }
    const side = sideOf(p, path)
    const n = normalOf(path.seg, side)
    // Surveyed ON the line — the usual shortcut — means "at the edge of it".
    // Moved to the edge on the side it was nearer, with a hand's clearance.
    const clearance = kind === 'bench' ? 0.45 : 0.3
    const edge = path.seg.half + clearance
    let at = path.dist < edge ? { x: path.at.x + n.x * edge, y: path.at.y + n.y * edge } : p
    // Never on the asphalt: a bench the survey left inside a carriageway goes
    // to the pavement on its own side.
    // Pushed AWAY from the carriageway holding it, not along the path's normal:
    // a bench between a footway and the avenue beyond it must not be shoved
    // further into the avenue.
    for (let k = 1; k <= 12 && net.within(at, 0.2, (s) => s.vehicular); k++) {
      const road = net.nearest(at, 30, (s) => s.vehicular)
      if (!road) break
      const away = road.dist > 1e-3 ? unit({ x: at.x - road.at.x, y: at.y - road.at.y }) : n
      at = { x: road.at.x + away.x * (road.seg.half + 0.6), y: road.at.y + away.y * (road.seg.half + 0.6) }
    }
    // Face the path from wherever it ended up: the kerb push above can carry a
    // bench across to the far side of a footway, and a bench keeping its old
    // heading there would sit with its back to the path.
    const { a, b } = path.seg
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    const fx = a.x + dx * t - at.x, fy = a.y + dy * t - at.y
    const yaw = Math.hypot(fx, fy) > 0.05 ? Math.atan2(fy, fx) : Math.atan2(-n.y, -n.x)
    out.push({ slot, at: { ...at, z: 0, yaw, seed } })
  }
  return out
}

/** +1 left of the segment's direction, -1 right; an exact hit is decided by hash. */
function sideOf(p: V, hit: { seg: Seg; at: V }): 1 | -1 {
  const { a, b } = hit.seg
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  if (Math.abs(cross) < 1e-6) return hashId(hit.seg.feature.id + hit.seg.index) % 2 === 0 ? 1 : -1
  return cross > 0 ? 1 : -1
}

/** Unit normal of a segment pointing to `side`. */
function normalOf(s: Seg, side: 1 | -1): V {
  const d = unit({ x: s.b.x - s.a.x, y: s.b.y - s.a.y })
  return { x: -d.y * side, y: d.x * side }
}

// ── Signal placement (pure) ──────────────────────────────────────────────────

export interface SignalPlan { kind: 'vehicle' | 'pedestrian'; at: Placed }

/** Kerb clearance from the carriageway edge to a signal mast, metres. */
const SIGNAL_KERB_M = 0.7
/** A one-way street this wide gets a second mast at its left kerb. */
const LEFT_MAST_WIDTH_M = 9.5
/** Two masts closer than this are one mast. */
const MAST_MERGE_M = 2.2

export function planSignals(
  features: ReadonlyArray<OsmFeature>,
  toLocal: (p: LatLonPoint) => V,
  network?: Network,
): SignalPlan[] {
  return runToEnd(signalPlanSteps(features, toLocal, network))
}

/** `planSignals`, pausable between signal nodes — see `steps`. */
function* signalPlanSteps(
  features: ReadonlyArray<OsmFeature>,
  toLocal: (p: LatLonPoint) => V,
  network?: Network,
): Steps<SignalPlan[]> {
  const net = network ?? buildNetwork(features, toLocal)
  const out: SignalPlan[] = []
  /** Standing in SOME carriageway — the crossing street's, or a parallel lane's. */
  const onCarriageway = (q: V): boolean =>
    net.within(q, 0.25, (s) => s.vehicular && s.feature.vertical?.structure !== 'bridge')
  /**
   * The nearest clear kerb: outward first (a lateral lane, a wide junction),
   * then upstream against the traffic — where a real mast stands when the
   * corner itself is asphalt. Null when there is no pavement to stand on.
   */
  const clear = (q: V, out: V, back: V): V | null => {
    for (let k = 0; k <= 8; k++) {
      const c = { x: q.x + out.x * k * 0.75, y: q.y + out.y * k * 0.75 }
      if (!onCarriageway(c)) return c
    }
    for (let j = 1; j <= 4; j++) {
      for (let k = 0; k <= 4; k++) {
        const c = { x: q.x + back.x * j * 3 + out.x * k * 0.75, y: q.y + back.y * j * 3 + out.y * k * 0.75 }
        if (!onCarriageway(c)) return c
      }
    }
    return null
  }
  const push = (plan: SignalPlan): void => {
    for (const o of out) {
      if (Math.hypot(o.at.x - plan.at.x, o.at.y - plan.at.y) < MAST_MERGE_M) {
        // A vehicle mast carries the pedestrian repeater too; keep the vehicle one.
        if (o.kind === 'pedestrian' && plan.kind === 'vehicle') { o.kind = 'vehicle'; o.at = plan.at }
        return
      }
    }
    out.push(plan)
  }

  for (const f of features) {
    if (f.kind !== 'signal' || !f.point) continue
    yield
    const p = toLocal(f.point)
    const vehicle = f.style.pedestrianSignal !== true
    const pedestrian = f.style.pedestrianSignal === true || f.style.crossingSignal === true

    // Which carriageway, and where along it.
    let seg: Seg | null = null
    let at = p
    const hits = net.vertexAt(f.point).filter((h) => h.feature.vertical?.structure !== 'bridge')
    if (hits.length > 0) {
      const h = hits[0]
      const ring = h.feature.ring!
      const i = h.index
      const a = toLocal(ring[Math.max(0, i - 1)])
      const b = toLocal(ring[Math.min(ring.length - 1, i + 1)])
      seg = { a, b, half: h.feature.widthM! / 2, vehicular: true, feature: h.feature, index: Math.max(0, i - 1) }
    } else {
      const near = net.nearest(p, 8, (s) => s.vehicular && s.feature.vertical?.structure !== 'bridge')
      if (near) { seg = near.seg; at = near.at }
    }
    if (!seg) continue
    const d = unit({ x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y })
    const right = { x: d.y, y: -d.x }
    const half = seg.half
    const st = seg.feature.style

    if (vehicle) {
      // Which travel directions this node controls.
      const fwd = st.onewayReverse ? -1 : 1
      const dirs: number[] = f.style.signalDirection === 'forward' ? [1]
        : f.style.signalDirection === 'backward' ? [-1]
          : f.style.signalDirection === 'both' ? [1, -1]
            : st.oneway ? [fwd] : [1, -1]
      for (const sgn of dirs) {
        const travel = { x: d.x * sgn, y: d.y * sgn }
        const r = { x: right.x * sgn, y: right.y * sgn }
        const facing = Math.atan2(-travel.y, -travel.x)
        const off = half + SIGNAL_KERB_M
        const back = { x: -travel.x, y: -travel.y }
        const rightKerb = clear({ x: at.x + r.x * off, y: at.y + r.y * off }, r, back)
        if (rightKerb) push({ kind: 'vehicle', at: { ...rightKerb, z: 0, yaw: facing, seed: `${f.id}${sgn}` } })
        if (st.oneway && half * 2 >= LEFT_MAST_WIDTH_M) {
          const left = { x: -r.x, y: -r.y }
          const leftKerb = clear({ x: at.x - r.x * off, y: at.y - r.y * off }, left, back)
          if (leftKerb) push({ kind: 'vehicle', at: { ...leftKerb, z: 0, yaw: facing, seed: `${f.id}${sgn}L` } })
        }
      }
    }
    if (pedestrian) {
      // One head at each kerb, beside the crossing rather than in it, each
      // looking across at the people who will read it.
      const off = half + 0.5
      const beside = 2.4
      for (const s of [1, -1] as const) {
        const o = { x: right.x * s, y: right.y * s }
        const q = clear({ x: at.x + o.x * off + d.x * beside * s, y: at.y + o.y * off + d.y * beside * s },
          o, { x: d.x * s, y: d.y * s })
        if (q) push({ kind: 'pedestrian', at: { ...q, z: 0, yaw: Math.atan2(-o.y, -o.x), seed: `${f.id}p${s}` } })
      }
    }
  }
  return out
}

// ── Procedural stand-ins (used when no authored asset is loaded) ──────────────

function coloured(geo: THREE.BufferGeometry, c: [number, number, number]): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set(c, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.deleteAttribute('uv')
  return g
}
function boxAt(w: number, d: number, h: number, x: number, y: number, z: number, c: [number, number, number]) {
  const g = new THREE.BoxGeometry(w, d, h); g.translate(x, y, z + h / 2); return coloured(g, c)
}
function cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, c: [number, number, number], seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z + h / 2); return coloured(g, c)
}
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = []
  for (const g of parts) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i))
    }
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return out
}

const IRON: [number, number, number] = [0.17, 0.2, 0.19]
const WOOD: [number, number, number] = [0.5, 0.34, 0.2]
const GREY: [number, number, number] = [0.45, 0.46, 0.47]
const GLOW: [number, number, number] = [0.95, 0.88, 0.7]
const STONE: [number, number, number] = [0.66, 0.62, 0.55]
const MARBLE: [number, number, number] = [0.86, 0.85, 0.82]
const BRONZE: [number, number, number] = [0.35, 0.27, 0.2]

/** Every stand-in faces +X, the convention of the authored kit. */
const PROCEDURAL: Record<FurnitureSlot | 'signal-vehicle' | 'signal-pedestrian', () => THREE.BufferGeometry> = {
  bench: () => mergeAll([
    boxAt(0.42, 1.8, 0.05, 0, 0, 0.42, WOOD), boxAt(0.05, 1.8, 0.4, -0.22, 0, 0.47, WOOD),
    boxAt(0.45, 0.06, 0.45, 0, -0.8, 0, IRON), boxAt(0.45, 0.06, 0.45, 0, 0.8, 0, IRON),
  ]),
  bin: () => mergeAll([cyl(0.2, 0.22, 0.6, 0.12, 0, 0.25, GREY), cyl(0.04, 0.04, 0.9, -0.12, 0, 0, IRON)]),
  fountain: () => mergeAll([cyl(0.14, 0.12, 1.3, 0, 0, 0, IRON), boxAt(0.35, 0.4, 0.12, 0.18, 0, 0.55, IRON)]),
  bollard: () => cyl(0.07, 0.06, 0.95, 0, 0, 0, IRON, 6),
  'lamp-street': () => mergeAll([
    cyl(0.12, 0.07, 9.5, 0, 0, 0, GREY), boxAt(2.6, 0.1, 0.1, 1.3, 0, 9.3, GREY), boxAt(0.7, 0.28, 0.12, 2.6, 0, 9.2, GLOW),
  ]),
  'lamp-park': () => mergeAll([cyl(0.12, 0.06, 3.6, 0, 0, 0, IRON), boxAt(0.34, 0.34, 0.55, 0, 0, 3.55, GLOW), boxAt(0.42, 0.42, 0.08, 0, 0, 4.1, IRON)]),
  // Stand-ins only; the authored park kit replaces them in Showcase.
  statue: () => mergeAll([boxAt(1.1, 1.1, 1.6, 0, 0, 0, STONE), cyl(0.28, 0.22, 1.9, 0, 0, 1.6, MARBLE, 8)]),
  bust: () => mergeAll([boxAt(0.5, 0.5, 1.5, 0, 0, 0, STONE), boxAt(0.45, 0.3, 0.55, 0, 0, 1.5, MARBLE)]),
  sculpture: () => mergeAll([boxAt(1.0, 1.0, 0.3, 0, 0, 0, STONE), cyl(0.35, 0.15, 2.2, 0, 0, 0.3, BRONZE, 6)]),
  slide: () => mergeAll([boxAt(1.2, 1.2, 1.5, -0.8, 0, 0, WOOD), boxAt(2.2, 0.5, 0.08, 0.9, 0, 0.7, [0.7, 0.2, 0.15])]),
  springy: () => mergeAll([cyl(0.06, 0.06, 0.4, 0, 0, 0, IRON, 6), boxAt(0.7, 0.25, 0.4, 0, 0, 0.4, [0.25, 0.55, 0.3])]),
  swing: () => mergeAll([boxAt(0.08, 0.08, 2.3, 0, -1.5, 0, IRON), boxAt(0.08, 0.08, 2.3, 0, 1.5, 0, IRON), boxAt(0.08, 3.1, 0.08, 0, 0, 2.3, IRON)]),
  pergola: () => mergeAll([
    boxAt(0.12, 0.12, 2.7, -1.8, -1.4, 0, WOOD), boxAt(0.12, 0.12, 2.7, 1.8, -1.4, 0, WOOD),
    boxAt(0.12, 0.12, 2.7, -1.8, 1.4, 0, WOOD), boxAt(0.12, 0.12, 2.7, 1.8, 1.4, 0, WOOD),
    boxAt(4.0, 3.0, 0.12, 0, 0, 2.7, [0.3, 0.42, 0.22]),
  ]),
  'signal-vehicle': () => mergeAll([
    cyl(0.07, 0.06, 3.3, 0, 0, 0, IRON), boxAt(0.22, 0.32, 0.95, 0.12, 0, 2.45, IRON),
    boxAt(0.05, 0.2, 0.2, 0.25, 0, 3.12, [0.9, 0.15, 0.12]), boxAt(0.05, 0.2, 0.2, 0.25, 0, 2.82, [0.95, 0.65, 0.1]),
    boxAt(0.05, 0.2, 0.2, 0.25, 0, 2.52, [0.2, 0.8, 0.35]),
  ]),
  'signal-pedestrian': () => mergeAll([
    cyl(0.06, 0.05, 2.5, 0, 0, 0, IRON), boxAt(0.2, 0.3, 0.62, 0.1, 0, 2.15, IRON),
    boxAt(0.05, 0.22, 0.22, 0.21, 0, 2.47, [0.9, 0.15, 0.12]), boxAt(0.05, 0.22, 0.22, 0.21, 0, 2.2, [0.2, 0.8, 0.35]),
  ]),
}

/** Which authored asset fills a slot, best first. */
function assetFor(slot: keyof typeof PROCEDURAL, bcn: boolean): string[] {
  switch (slot) {
    case 'bench': return bcn ? ['bench-bcn', 'bench'] : ['bench', 'bench-bcn']
    case 'bin': return bcn ? ['waste-basket-bcn', 'litter-bin'] : ['litter-bin', 'waste-basket-bcn']
    case 'fountain': return ['fountain-bcn']
    case 'bollard': return ['bollard']
    case 'lamp-street': return bcn ? ['lamp-street-bcn', 'street-lamp'] : ['street-lamp', 'lamp-street-bcn']
    case 'lamp-park': return bcn ? ['lamp-park-bcn'] : ['lamp-park-bcn']
    case 'signal-vehicle': return bcn ? ['traffic-signal-bcn', 'traffic-signal'] : ['traffic-signal', 'traffic-signal-bcn']
    case 'signal-pedestrian': return ['ped-signal']
    case 'statue': return ['statue-plinth']
    case 'bust': return ['bust-pedestal']
    case 'sculpture': return ['sculpture-modern']
    case 'slide': return ['playground-slide']
    case 'springy': return ['playground-springy']
    case 'swing': return ['playground-swing']
    case 'pergola': return ['pergola-bcn']
  }
}

// ── Layers ────────────────────────────────────────────────────────────────────

export interface FurnitureLayer { object: THREE.Group; count: number; counts: Record<string, number> }

function frameFor(opts: StreetFurnitureOptions) {
  return createGroundFrame({
    anchorLat: opts.anchorLat, anchorElevationM: opts.anchorElevationM,
    sampleGroundM: opts.sampleGroundM, exaggeration: opts.exaggeration,
  })
}

function localFrame(opts: StreetFurnitureOptions) {
  const frame = frameFor(opts)
  const mToN = frame.mToN
  const origin = latLonToNormalized(opts.anchorLat, opts.anchorLon ?? 0)
  const toLocal = (p: LatLonPoint): V => {
    const n = latLonToNormalized(p.lat, p.lon)
    return { x: (n.nx - origin.nx) / mToN, y: (n.ny - origin.ny) / mToN }
  }
  const groundM = (p: V): number => frame.groundZ(origin.nx + p.x * mToN, origin.ny + p.y * mToN) / mToN
  const excluded = (p: V): boolean => opts.excludeAt?.(origin.nx + p.x * mToN, origin.ny + p.y * mToN) ?? false
  const group = (name: string): THREE.Group => {
    const g = new THREE.Group()
    g.name = name
    g.position.set(origin.nx, origin.ny, 0)
    g.scale.setScalar(mToN)
    g.renderOrder = 5
    return g
  }
  return { frame, mToN, origin, toLocal, groundM, excluded, group }
}

function instanced(
  geo: THREE.BufferGeometry, spots: ReadonlyArray<Placed>, name: string, roughness: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness }), spots.length,
  )
  mesh.name = name
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), z = new THREE.Vector3(0, 0, 1)
  spots.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(z, p.yaw), s)))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

function geometryFor(slot: keyof typeof PROCEDURAL, opts: StreetFurnitureOptions): THREE.BufferGeometry {
  for (const name of assetFor(slot, opts.barcelona === true)) {
    const g = opts.assets?.get(name)
    if (g) return g.clone()
  }
  return PROCEDURAL[slot]()
}

/** Mapped benches, bins, fountains, lamps and bollards. */
export function buildFurnitureLayer(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions,
): FurnitureLayer | null {
  return runToEnd(furnitureLayerSteps(features, opts))
}

/** `buildFurnitureLayer` a slice at a time; `undefined` means cancelled. */
export function buildFurnitureLayerSliced(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions, slice: SliceOptions = {},
): Promise<FurnitureLayer | null | undefined> {
  return runSliced(furnitureLayerSteps(features, opts), slice)
}

function* furnitureLayerSteps(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions,
): Steps<FurnitureLayer | null> {
  if (!features.some((f) => f.kind === 'furniture')) return null
  const L = localFrame(opts)
  const plans = yield* furniturePlanSteps(features, L.toLocal)
  const bySlot = new Map<FurnitureSlot, Placed[]>()
  for (const { slot, at } of plans) {
    if (L.excluded(at)) continue
    at.z = L.groundM(at)
    const list = bySlot.get(slot)
    if (list) list.push(at); else bySlot.set(slot, [at])
  }
  if (bySlot.size === 0) return null
  const group = L.group('osm-furniture')
  const counts: Record<string, number> = {}
  let count = 0
  for (const [slot, spots] of bySlot) {
    group.add(instanced(geometryFor(slot, opts), spots, `osm-furniture-${slot}`, slot === 'bench' ? 0.7 : 0.5))
    counts[slot] = spots.length
    count += spots.length
  }
  return { object: group, count, counts }
}

/** Traffic and pedestrian signals, at the kerb, facing the traffic they control. */
export function buildPlacedSignalLayer(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions,
): FurnitureLayer | null {
  return runToEnd(signalLayerSteps(features, opts))
}

/** `buildPlacedSignalLayer` a slice at a time; `undefined` means cancelled. */
export function buildPlacedSignalLayerSliced(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions, slice: SliceOptions = {},
): Promise<FurnitureLayer | null | undefined> {
  return runSliced(signalLayerSteps(features, opts), slice)
}

function* signalLayerSteps(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions,
): Steps<FurnitureLayer | null> {
  if (!features.some((f) => f.kind === 'signal')) return null
  const L = localFrame(opts)
  const plans = yield* signalPlanSteps(features, L.toLocal)
  const vehicle: Placed[] = [], pedestrian: Placed[] = []
  for (const { kind, at } of plans) {
    if (L.excluded(at)) continue
    at.z = L.groundM(at)
    ;(kind === 'vehicle' ? vehicle : pedestrian).push(at)
  }
  if (vehicle.length + pedestrian.length === 0) return null
  const group = L.group('osm-signals')
  if (vehicle.length) group.add(instanced(geometryFor('signal-vehicle', opts), vehicle, 'osm-signals-vehicle', 0.55))
  if (pedestrian.length) group.add(instanced(geometryFor('signal-pedestrian', opts), pedestrian, 'osm-signals-pedestrian', 0.55))
  return { object: group, count: vehicle.length + pedestrian.length, counts: { vehicle: vehicle.length, pedestrian: pedestrian.length } }
}

// ── Barriers ──────────────────────────────────────────────────────────────────

/** A park's lawn-edge railing: the knee-high hoops round the Ciutadella's lawns. */
const LAWN_FENCE_M = 0.75

/** Default heights when untagged, metres — typical of what each is in a city. */
const BARRIER_HEIGHT_M: Record<string, number> = {
  fence: 1.6, wall: 2.0, hedge: 1.3, retaining_wall: 1.2, guard_rail: 0.8, city_wall: 6, handrail: 1.0,
}
const BARRIER_TONE: Record<string, [number, number, number]> = {
  fence: [0.16, 0.2, 0.18],        // painted iron railing, Barcelona's park green-black
  wall: [0.72, 0.66, 0.56],        // rendered garden wall
  hedge: [0.2, 0.33, 0.16],
  retaining_wall: [0.6, 0.58, 0.54],
  guard_rail: [0.62, 0.64, 0.66],
  city_wall: [0.64, 0.56, 0.44],   // stone
  handrail: [0.3, 0.32, 0.33],
}

/**
 * Fences, walls and hedges as standing geometry that follows the ground.
 *
 * A railing is drawn as a fence PANEL whose bars are cut by the shader
 * (`aFence` carries metres along and up), so a kilometre of park railings is a
 * strip of quads rather than tens of thousands of bars.
 */
export function buildBarrierLayer(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions,
): FurnitureLayer | null {
  return runToEnd(barrierLayerSteps(features, opts))
}

/** `buildBarrierLayer` a slice at a time; `undefined` means cancelled. */
export function buildBarrierLayerSliced(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions, slice: SliceOptions = {},
): Promise<FurnitureLayer | null | undefined> {
  return runSliced(barrierLayerSteps(features, opts), slice)
}

function* barrierLayerSteps(
  features: ReadonlyArray<OsmFeature>, opts: StreetFurnitureOptions,
): Steps<FurnitureLayer | null> {
  const wanted = features.filter((f) => f.kind === 'barrier' && f.ring && f.ring.length >= 2)
  if (wanted.length === 0) return null
  const L = localFrame(opts)
  const pos: number[] = [], nor: number[] = [], col: number[] = [], fence: number[] = []
  let count = 0
  const STEP_M = 4

  const quad = (a: V, b: V, za: number, zb: number, h: number, nx: number, ny: number,
    c: [number, number, number], u0: number, u1: number, pattern: number, off = 0): void => {
    const ax = a.x + nx * off, ay = a.y + ny * off, bx = b.x + nx * off, by = b.y + ny * off
    const v = [
      [ax, ay, za, u0, 0], [bx, by, zb, u1, 0], [bx, by, zb + h, u1, h],
      [ax, ay, za, u0, 0], [bx, by, zb + h, u1, h], [ax, ay, za + h, u0, h],
    ]
    for (const [x, y, z, u, w] of v) {
      pos.push(x, y, z); nor.push(nx, ny, 0); col.push(c[0], c[1], c[2]); fence.push(u, w, pattern, h)
    }
  }
  const cap = (a: V, b: V, za: number, zb: number, h: number, t: number, c: [number, number, number], nx: number, ny: number): void => {
    const p = [[a.x + nx * t, a.y + ny * t, za], [b.x + nx * t, b.y + ny * t, zb], [b.x - nx * t, b.y - ny * t, zb], [a.x - nx * t, a.y - ny * t, za]]
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(p[k][0], p[k][1], p[k][2] + h); nor.push(0, 0, 1); col.push(c[0] * 0.9, c[1] * 0.9, c[2] * 0.9); fence.push(0, h, 0, h) }
  }

  // The parks the barriers stand in, for the untagged fence rule below.
  const parks = features.filter((f) => f.kind === 'green' && f.style.cover === 'park' && f.ring && f.ring.length >= 3)
    .map((f) => f.ring!.map(L.toLocal))
  const insidePark = (p: V): { inside: boolean; edgeM: number } => {
    let best = { inside: false, edgeM: Infinity }
    for (const ring of parks) {
      let hit = false
      let edge = Infinity
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
        const dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        edge = Math.min(edge, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy))
      }
      if (hit && (!best.inside || edge < best.edgeM)) best = { inside: true, edgeM: edge }
    }
    return best
  }

  for (const f of wanted) {
    yield
    const kind = f.style.barrier ?? 'fence'
    // AN UNTAGGED FENCE IN A PARK IS A LAWN EDGE. 69 of the 81 fences in the
    // Ciutadella box carry no height, and most of them hoop the lawns at knee
    // height; drawn at the street default they walled every lawn in 1.6 m of
    // railing. The ones on the park's own boundary are the perimeter railing.
    let fenceDefault = BARRIER_HEIGHT_M[kind] ?? 1.5
    if (kind === 'fence' && f.style.barrierHeightM === undefined && f.ring!.length >= 2) {
      const mid = L.toLocal(f.ring![Math.floor(f.ring!.length / 2)])
      const park = insidePark(mid)
      if (park.inside) fenceDefault = park.edgeM < 4 ? 2.0 : LAWN_FENCE_M
    }
    const h = f.style.barrierHeightM ?? fenceDefault
    const tone = BARRIER_TONE[kind] ?? BARRIER_TONE.fence
    const thick = (f.widthM ?? 0.1) / 2
    const pts = f.ring!.map(L.toLocal)
    // A railing reads as bars, chain link as a mesh; everything else is solid.
    const ft = (f.style.fenceType ?? '').toLowerCase()
    const pattern = kind === 'fence' ? (ft.includes('chain') || ft.includes('mesh') || ft === 'wire' ? 2 : ft === 'wood' || ft === 'panel' ? 0 : 1)
      : kind === 'guard_rail' || kind === 'handrail' ? 3 : 0
    let u = 0
    let drew = false
    for (let i = 1; i < pts.length; i++) {
      const a0 = pts[i - 1], b0 = pts[i]
      const len = Math.hypot(b0.x - a0.x, b0.y - a0.y)
      if (len < 0.05) continue
      const nx = -(b0.y - a0.y) / len, ny = (b0.x - a0.x) / len
      const steps = Math.max(1, Math.ceil(len / STEP_M))
      for (let k = 0; k < steps; k++) {
        const a = { x: a0.x + ((b0.x - a0.x) * k) / steps, y: a0.y + ((b0.y - a0.y) * k) / steps }
        const b = { x: a0.x + ((b0.x - a0.x) * (k + 1)) / steps, y: a0.y + ((b0.y - a0.y) * (k + 1)) / steps }
        if (L.excluded(a) && L.excluded(b)) { u += len / steps; continue }
        const za = L.groundM(a) - 0.15, zb = L.groundM(b) - 0.15
        const du = len / steps
        const hh = h + 0.15
        if (pattern !== 0) {
          // A panel with no thickness: one face each way so both sides are lit.
          quad(a, b, za, zb, hh, nx, ny, tone, u, u + du, pattern)
          quad(b, a, zb, za, hh, -nx, -ny, tone, u + du, u, pattern)
        } else {
          quad(a, b, za, zb, hh, nx, ny, tone, u, u + du, 0, thick)
          quad(b, a, zb, za, hh, -nx, -ny, tone, u + du, u, 0, thick)
          cap(a, b, za, zb, hh, thick, tone, nx, ny)
        }
        u += du
        drew = true
      }
    }
    if (drew) count++
  }
  if (count === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('aFence', new THREE.Float32BufferAttribute(fence, 4))
  geo.computeBoundingSphere()
  const mesh = new THREE.Mesh(geo, createBarrierMaterial())
  mesh.name = 'osm-barriers'
  const group = L.group('osm-barriers')
  group.add(mesh)
  return { object: group, count, counts: { barriers: count } }
}

/**
 * Lit material that cuts railings and chain link out of a flat panel.
 * pattern 0 solid · 1 railing (bars 12 cm apart, rails top and bottom) ·
 * 2 chain link (diamond mesh) · 3 guard rail (a steel band on posts).
 */
export function createBarrierMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide })
  m.name = 'osm-barrier'
  m.customProgramCacheKey = () => 'osm-barrier'
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFence;\nvarying vec4 vFence;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFence = aFence;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFence;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        // x: metres along, y: metres up from 15 cm below grade, z: pattern, w: panel height.
        float pat = floor(vFence.z + 0.5);
        float u = vFence.x, v = vFence.y, top = vFence.w;
        if (pat > 0.5 && pat < 1.5) {
          // Railing: bars 12 cm apart, a post every 2.5 m, a rail at the top
          // and one just above the ground.
          float bar = abs(fract(u / 0.12) - 0.5) * 0.12;
          float post = abs(fract(u / 2.5) - 0.5) * 2.5;
          bool rails = v > top - 0.07 || (v > 0.27 && v < 0.33);
          if (!(bar < 0.011 || post < 0.035 || rails)) discard;
        } else if (pat > 1.5 && pat < 2.5) {
          // Chain link: a diamond mesh between posts every 3 m.
          float d1 = abs(fract((u + v) / 0.07) - 0.5);
          float d2 = abs(fract((u - v) / 0.07) - 0.5);
          float post = abs(fract(u / 3.0) - 0.5) * 3.0;
          if (min(d1, d2) > 0.1 && post > 0.035 && v < top - 0.04) discard;
        } else if (pat > 2.5) {
          // Guard rail: a steel band on posts every 2 m.
          float post = abs(fract(u / 2.0) - 0.5) * 2.0;
          bool band = v > top - 0.4 && v < top - 0.05;
          if (!band && post > 0.06) discard;
        }
      }`)
  }
  return m
}
