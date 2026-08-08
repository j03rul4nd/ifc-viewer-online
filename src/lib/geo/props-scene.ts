// ─── props-scene ──────────────────────────────────────────────────────────────
// The things that make a street look inhabited: traffic signals, cars, trains,
// street lamps, platform shelters.
//
// ONE HONESTY LINE RUNS THROUGH THIS FILE, and it is not decoration:
//
//   • Traffic signals are DATA. `highway=traffic_signals` is a mapped node —
//     somebody surveyed that junction. We draw them where they are.
//   • Everything else here is SCENERY. OpenStreetMap does not record where cars
//     are parked, where a train is standing, which kerb carries a lamp column or
//     whether a platform is sheltered. It never could. Every bit of that
//     placement is invented to make a view feel lived-in.
//
// So they are separate layers with separate switches, both off by default, and
// the scenery switch says in the UI that it is scenery. A client looking at a
// render must never be able to mistake our set dressing for survey.
//
// Everything is instanced: one draw call per prop type, whatever the count.

import * as THREE from 'three'
import { latLonToNormalized, metresToNormalized } from './geo-math'
import { hashId, variate } from './feature-variation'
import type { OsmFeature } from './osm-features'

export interface PropsOptions {
  anchorLat: number
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  anchorElevationM?: number
  /**
   * Authored geometry for showcase mode, once it has loaded. Absent means "use
   * the procedural version" — which is also what a failed download looks like,
   * so a missing asset degrades to the box rather than to nothing.
   */
  assets?: Map<string, THREE.BufferGeometry> | null
}

export interface PropsLayer {
  object: THREE.Group
  count: number
  /**
   * What the count is made of. Vehicles and street furniture are placed by
   * different rules with different densities, and a single total hides a
   * street full of lamps behind a street with two cars on it.
   */
  counts: { vehicles: number; lamps: number; canopies: number }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** A box in the Z-up frame, sized in metres, centred on x/y and sitting on z0. */
function box(w: number, d: number, h: number, at: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, d, h)
  g.translate(at[0], at[1], at[2] + h / 2)
  return g
}

/** Merge parts, keeping position + normal + a flat colour per part. */
function merge(parts: Array<{ geo: THREE.BufferGeometry; color: [number, number, number] }>): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []

  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo
    g.computeVertexNormals()
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i))
      normals.push(n.getX(i), n.getY(i), n.getZ(i))
      colors.push(color[0], color[1], color[2])
    }
    if (g !== geo) g.dispose()
    geo.dispose()
  }

  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return out
}

// ── Traffic signals (DATA) ────────────────────────────────────────────────────

const POLE = [0.16, 0.17, 0.18] as [number, number, number]
const HOUSING = [0.13, 0.14, 0.15] as [number, number, number]
const LAMP_RED = [0.86, 0.16, 0.14] as [number, number, number]
const LAMP_AMBER = [0.92, 0.66, 0.12] as [number, number, number]
const LAMP_GREEN = [0.22, 0.74, 0.36] as [number, number, number]

/**
 * A signal head on a pole, with three lamps.
 *
 * The lamps are what makes it readable: a bare grey post at this scale is a
 * bollard. Three coloured dots stacked vertically are recognised instantly,
 * from any distance at which the pole itself is more than one pixel.
 */
function signalGeometry(): THREE.BufferGeometry {
  const POLE_H = 3.4
  const parts: Array<{ geo: THREE.BufferGeometry; color: [number, number, number] }> = []

  const post = new THREE.CylinderGeometry(0.07, 0.09, POLE_H, 6)
  post.rotateX(Math.PI / 2)
  post.translate(0, 0, POLE_H / 2)
  parts.push({ geo: post, color: POLE })

  // Housing, then the three lamps proud of its face so they catch the light.
  parts.push({ geo: box(0.34, 0.26, 0.95, [0, 0, POLE_H - 0.15]), color: HOUSING })
  const lamp = (z: number, color: [number, number, number]): void => {
    const l = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8)
    l.rotateX(Math.PI / 2)
    l.rotateX(Math.PI / 2)          // face along -y, out of the housing
    l.translate(0, -0.15, POLE_H - 0.15 + z)
    parts.push({ geo: l, color })
  }
  lamp(0.76, LAMP_RED)
  lamp(0.48, LAMP_AMBER)
  lamp(0.20, LAMP_GREEN)

  return merge(parts)
}

/**
 * Traffic signals, where OpenStreetMap says they are.
 */
export function buildSignalLayer(
  features: ReadonlyArray<OsmFeature>, opts: PropsOptions,
): PropsLayer | null {
  const signals = features.filter((f) => f.kind === 'signal' && f.point)
  if (signals.length === 0) return null

  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM

  const authored = opts.assets?.get('traffic-signal') ?? null
  const mesh = new THREE.InstancedMesh(
    authored ? authored.clone() : signalGeometry(),
    // Lit like everything else in the scene. A signal head is painted metal in
    // a dark housing; the lenses read as lenses because they are baked bright
    // in the vertex colour and the housing is not.
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.55 }),
    signals.length,
  )
  mesh.name = 'osm-signals'

  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3(mToN, mToN, mToN)
  const zAxis = new THREE.Vector3(0, 0, 1)

  signals.forEach((f, i) => {
    const { nx, ny } = latLonToNormalized(f.point!.lat, f.point!.lon)
    const ground = sample ? sample(nx, ny) : anchorElevation
    p.set(nx, ny, (ground - anchorElevation) * mToN)
    // We do not know which way it faces; a deterministic yaw beats a row of
    // signals all staring the same direction, which reads as a copy-paste.
    q.setFromAxisAngle(zAxis, variate(f.id, 7) * Math.PI * 2)
    mesh.setMatrixAt(i, m.compose(p, q, s))
  })
  mesh.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.name = 'osm-signals'
  group.renderOrder = 5
  group.add(mesh)
  return {
    object: group,
    count: signals.length,
    counts: { vehicles: 0, lamps: 0, canopies: 0 },
  }
}

// ── Vehicles (PROPS — invented placement) ─────────────────────────────────────

/** Car body colours a real street actually shows, in rough proportion. */
const CAR_COLORS: Array<[number, number, number]> = [
  [0.82, 0.82, 0.83], // silver
  [0.88, 0.88, 0.89], // white
  [0.16, 0.17, 0.19], // black
  [0.30, 0.32, 0.36], // graphite
  [0.55, 0.13, 0.14], // red
  [0.15, 0.28, 0.48], // blue
  [0.35, 0.40, 0.36], // green
]
const GLASS = [0.22, 0.26, 0.30] as [number, number, number]

/** One car: body, cabin, and a dark band that reads as glazing. */
function carGeometry(color: [number, number, number]): THREE.BufferGeometry {
  return merge([
    { geo: box(4.3, 1.85, 0.75, [0, 0, 0.22]), color },
    { geo: box(2.3, 1.72, 0.62, [-0.15, 0, 0.95]), color: GLASS },
    // Wheels read as a dark shadow line rather than as geometry nobody sees.
    { geo: box(4.35, 1.95, 0.22, [0, 0, 0]), color: [0.1, 0.1, 0.11] },
  ])
}

/** One carriage: body, roof, window band, skirt. */
function carriageGeometry(): THREE.BufferGeometry {
  const BODY = [0.74, 0.75, 0.78] as [number, number, number]
  const ROOF = [0.55, 0.56, 0.58] as [number, number, number]
  return merge([
    { geo: box(19, 2.9, 2.5, [0, 0, 0.9]), color: BODY },
    { geo: box(17.4, 2.95, 0.55, [0, 0, 2.05]), color: GLASS },
    { geo: box(18.4, 2.7, 0.35, [0, 0, 3.4]), color: ROOF },
    { geo: box(18.6, 2.6, 0.7, [0, 0, 0.2]), color: [0.2, 0.21, 0.22] },
  ])
}

/** A column with a luminaire on a short arm. The procedural stand-in. */
function lampGeometry(): THREE.BufferGeometry {
  const COLUMN = [0.34, 0.35, 0.36] as [number, number, number]
  const HEAD = [0.82, 0.81, 0.77] as [number, number, number]
  const H = 7
  const column = new THREE.CylinderGeometry(0.06, 0.1, H, 6)
  column.rotateX(Math.PI / 2)
  column.translate(0, 0, H / 2)
  return merge([
    { geo: column, color: COLUMN },
    { geo: box(0.32, 0.32, 0.35, [0, 0, 0]), color: COLUMN },
    // The arm reaches over the carriageway, which is the shape that says
    // "street lamp" rather than "post".
    { geo: box(1.5, 0.13, 0.13, [0.75, 0, H - 0.2]), color: COLUMN },
    { geo: box(0.62, 0.26, 0.13, [1.55, 0, H - 0.28]), color: HEAD },
  ])
}

/**
 * The long axis of a polygon, by the covariance of its vertices.
 *
 * A station platform is a long thin rectangle at an arbitrary angle, and its
 * ring is not wound in any dependable order — the longest single edge is the
 * wrong answer for a platform mapped with a rounded end. The principal axis is
 * the direction the shape actually runs, which is what a shelter has to align
 * with; anything else stands across the platform and reads as a mistake.
 *
 * Returns null for a degenerate ring (every point the same), because there is
 * no axis to speak of and atan2 would happily invent one.
 */
function principalAxis(pts: ReadonlyArray<{ nx: number; ny: number }>):
{ cx: number; cy: number; yaw: number; extentU: number; extentV: number } | null {
  const n = pts.length
  let cx = 0
  let cy = 0
  for (const p of pts) { cx += p.nx; cy += p.ny }
  cx /= n
  cy /= n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of pts) {
    const dx = p.nx - cx
    const dy = p.ny - cy
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx + syy <= 0) return null

  const yaw = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of pts) {
    const dx = p.nx - cx
    const dy = p.ny - cy
    const u = dx * cos + dy * sin
    const v = -dx * sin + dy * cos
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  return { cx, cy, yaw, extentU: maxU - minU, extentV: maxV - minV }
}

/** Roads too narrow to hold a car — placing one there is obviously wrong. */
const MIN_ROAD_WIDTH_M = 4.5
/** And a 12 m bus needs more than a car does. */
const MIN_BUS_ROAD_WIDTH_M = 7
/** Spacing along a carriageway, metres. Sparse on purpose: a full road reads as a jam. */
const CAR_SPACING_M = 85
const MAX_CARS = 700
const MAX_TRAINS = 40
/** Carriages in a standing train. */
const TRAIN_CARRIAGES = 4

/** Column spacing along a lit street, metres. */
const LAMP_SPACING_M = 38
/** Below this, it is a lane or an alley and a lighting column would look odd. */
const MIN_LAMP_ROAD_WIDTH_M = 6
const MAX_LAMPS = 900

/** The authored shelter's own footprint, metres — what we scale relative to. */
const CANOPY_WIDTH_M = 6.8
/** A platform narrower than this cannot hold a shelter. */
const MIN_PLATFORM_WIDTH_M = 3.2
/** Platform length each shelter is taken to cover. */
const CANOPY_EVERY_M = 34
const MAX_CANOPIES = 60

/**
 * Cars on the carriageways and trains on the track.
 *
 * Placement is invented but DETERMINISTIC: the same street gets the same cars
 * every time, so a view does not reshuffle itself between screenshots. Density
 * is deliberately low — the point is "this is a street", not rush hour.
 */
export function buildVehicleLayer(
  features: ReadonlyArray<OsmFeature>, opts: PropsOptions,
): PropsLayer | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM
  const spacing = CAR_SPACING_M * mToN

  interface Placement {
    x: number; y: number; z: number; yaw: number; seed: string
    /** Road wide enough for a bus. Decided at placement, where the width is. */
    wide?: boolean
  }
  const cars: Placement[] = []
  const carriages: Placement[] = []
  const lamps: Placement[] = []
  const canopies: Array<{ x: number; y: number; z: number; yaw: number; widthScale: number }> = []

  const groundZ = (x: number, y: number): number =>
    ((sample ? sample(x, y) : anchorElevation) - anchorElevation) * mToN

  for (const f of features) {
    const isRoad = f.kind === 'road' && f.widthM !== undefined
      && f.widthM >= MIN_ROAD_WIDTH_M && !f.style.crossing
    const isTrack = f.kind === 'rail' && f.widthM !== undefined && f.style.railKind !== 'platform'
    if ((!isRoad && !isTrack) || !f.ring || f.ring.length < 2) continue
    if (isRoad && cars.length >= MAX_CARS) continue
    if (isTrack && carriages.length >= MAX_TRAINS * TRAIN_CARRIAGES) continue

    // Only some ways carry anything — every street occupied looks staged.
    if (variate(f.id, 11) > (isRoad ? 0.55 : 0.3)) continue

    const pts = f.ring.map((pt) => latLonToNormalized(pt.lat, pt.lon))
    // Walk the way and drop vehicles at intervals, facing along it.
    let carried = spacing * (0.3 + variate(f.id, 12) * 0.5)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.nx - a.nx
      const dy = b.ny - a.ny
      const len = Math.hypot(dx, dy)
      if (len === 0) continue
      const yaw = Math.atan2(dy, dx)

      let t = carried
      while (t <= len) {
        const x = a.nx + (dx * t) / len
        const y = a.ny + (dy * t) / len
        // Sit in a lane, not on the centre line.
        const off = (isRoad ? (f.widthM! * 0.25) : 0) * mToN
        const px = x - (dy / len) * off
        const py = y + (dx / len) * off
        const seed = `${f.id}#${cars.length + carriages.length}`
        const spot = {
          x: px, y: py, z: groundZ(px, py), yaw, seed,
          wide: isRoad && f.widthM! >= MIN_BUS_ROAD_WIDTH_M,
        }
        if (isRoad) cars.push(spot)
        else carriages.push(spot)
        t += isTrack ? (20 * mToN) : spacing
      }
      carried = Math.max(0, t - len)
    }
  }

  // ── Lighting columns ────────────────────────────────────────────────────────
  // A separate walk rather than a branch inside the one above: lamps have their
  // own spacing, their own minimum road, and they stand on the kerb rather than
  // in a lane. Folding them in would make both harder to reason about.
  const lampSpacing = LAMP_SPACING_M * mToN
  for (const f of features) {
    if (lamps.length >= MAX_LAMPS) break
    if (f.kind !== 'road' || f.widthM === undefined || f.style.crossing) continue
    if (f.widthM < MIN_LAMP_ROAD_WIDTH_M || !f.ring || f.ring.length < 2) continue

    // Which kerb is decided ONCE per way. Columns that swap sides halfway down
    // a street is the kind of detail nobody names but everybody notices.
    const side = variate(f.id, 21) < 0.5 ? 1 : -1
    const off = (f.widthM * 0.5 + 0.9) * mToN
    const pts = f.ring.map((pt) => latLonToNormalized(pt.lat, pt.lon))
    let carried = lampSpacing * variate(f.id, 22)

    for (let i = 0; i < pts.length - 1 && lamps.length < MAX_LAMPS; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.nx - a.nx
      const dy = b.ny - a.ny
      const len = Math.hypot(dx, dy)
      if (len === 0) continue
      const yaw = Math.atan2(dy, dx)

      let t = carried
      while (t <= len && lamps.length < MAX_LAMPS) {
        const x = a.nx + (dx * t) / len - (dy / len) * off * side
        const y = a.ny + (dy * t) / len + (dx / len) * off * side
        lamps.push({
          x, y, z: groundZ(x, y),
          // The arm has to reach OVER the carriageway, so the column faces back
          // across the road it lights — not along it.
          yaw: yaw - (side * Math.PI) / 2,
          seed: `${f.id}#lamp${lamps.length}`,
        })
        t += lampSpacing
      }
      carried = Math.max(0, t - len)
    }
  }

  // ── Platform shelters ───────────────────────────────────────────────────────
  // Showcase only: there is no procedural fallback, because a grey box standing
  // on a platform is worse than an unsheltered platform.
  const authoredCanopy = opts.assets?.get('platform-canopy') ?? null
  if (authoredCanopy) {
    for (const f of features) {
      if (canopies.length >= MAX_CANOPIES) break
      if (f.kind !== 'rail' || f.style.railKind !== 'platform') continue
      if (!f.ring || f.ring.length < 3) continue

      const pts = f.ring.map((pt) => latLonToNormalized(pt.lat, pt.lon))
      const axis = principalAxis(pts)
      if (!axis) continue
      const lengthM = axis.extentU / mToN
      const widthM = axis.extentV / mToN
      if (widthM < MIN_PLATFORM_WIDTH_M || lengthM < 12) continue

      // One shelter per stretch of platform, spread down the middle of it —
      // real platforms are sheltered in the centre and open at the ends.
      const n = Math.min(4, Math.max(1, Math.floor(lengthM / CANOPY_EVERY_M)))
      const span = axis.extentU * 0.6
      for (let i = 0; i < n && canopies.length < MAX_CANOPIES; i++) {
        const at = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)
        const x = axis.cx + Math.cos(axis.yaw) * at
        const y = axis.cy + Math.sin(axis.yaw) * at
        canopies.push({
          x, y, z: groundZ(x, y), yaw: axis.yaw,
          // Fit the platform's width; never wider than the asset was authored.
          widthScale: Math.min(1.15, Math.max(0.6, widthM / CANOPY_WIDTH_M)),
        })
      }
    }
  }

  if (cars.length === 0 && carriages.length === 0
    && lamps.length === 0 && canopies.length === 0) return null

  const group = new THREE.Group()
  group.name = 'osm-vehicles'
  group.renderOrder = 5

  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3(mToN, mToN, mToN)
  const zAxis = new THREE.Vector3(0, 0, 1)

  const place = (
    spots: Placement[], geo: THREE.BufferGeometry, name: string,
  ): THREE.InstancedMesh | null => {
    if (spots.length === 0) { geo.dispose(); return null }
    const mesh = new THREE.InstancedMesh(
      // Vehicle paint: smoother than the road under it, which is most of what
      // makes a parked car read as a car at this size.
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.38 }),
      spots.length,
    )
    mesh.name = name
    spots.forEach((spot, i) => {
      p.set(spot.x, spot.y, spot.z)
      q.setFromAxisAngle(zAxis, spot.yaw)
      mesh.setMatrixAt(i, m.compose(p, q, s))
    })
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }

  const authoredCar = opts.assets?.get('car') ?? null
  const authoredVan = opts.assets?.get('van') ?? null
  const authoredCarriage = opts.assets?.get('train-carriage') ?? null

  if (authoredCar) {
    // The authored bodies are painted neutral, so ONE mesh per silhouette
    // carries the whole palette through per-instance colour — fewer draw calls
    // than the procedural path, not more.
    //
    // The mix is what sells a street: all hatchbacks reads as a car park. Buses
    // are rarest and only where one could physically turn — a 12 m bus on a
    // 5 m lane is the sort of detail that undoes the whole view.
    const authoredBus = opts.assets?.get('bus') ?? null
    const buses = authoredBus
      ? cars.filter((c) => c.wide && hashId(`${c.seed}#kind`) % 23 === 0)
      : []
    const busSet = new Set(buses)
    const vanSet = new Set(
      authoredVan
        ? cars.filter((c) => !busSet.has(c) && hashId(`${c.seed}#kind`) % 7 === 0)
        : [],
    )
    const tinted = (spots: Placement[], geo: THREE.BufferGeometry, name: string): void => {
      const mesh = place(spots, geo.clone(), name)
      if (!mesh) return
      const col = new THREE.Color()
      spots.forEach((spot, i) => {
        const [r, g, b] = CAR_COLORS[hashId(`${spot.seed}#paint`) % CAR_COLORS.length]
        mesh.setColorAt(i, col.setRGB(r, g, b))
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      group.add(mesh)
    }
    tinted(cars.filter((c) => !vanSet.has(c) && !busSet.has(c)), authoredCar, 'osm-cars')
    if (authoredVan && vanSet.size > 0) tinted([...vanSet], authoredVan, 'osm-vans')
    if (authoredBus && buses.length > 0) tinted(buses, authoredBus, 'osm-buses')
  } else {
    // One instanced mesh per body colour: the palette is what stops a street of
    // identical silver boxes, and seven draw calls is still nothing.
    CAR_COLORS.forEach((color, ci) => {
      const mine = cars.filter((c) => hashId(`${c.seed}#paint`) % CAR_COLORS.length === ci)
      const mesh = place(mine, carGeometry(color), `osm-cars-${ci}`)
      if (mesh) group.add(mesh)
    })
  }

  const train = place(
    carriages, authoredCarriage ? authoredCarriage.clone() : carriageGeometry(), 'osm-train',
  )
  if (train) group.add(train)

  const authoredLamp = opts.assets?.get('street-lamp') ?? null
  const lampMesh = place(
    lamps, authoredLamp ? authoredLamp.clone() : lampGeometry(), 'osm-lamps',
  )
  if (lampMesh) {
    // Painted metal, and rougher than a car: a column that mirrors the sky reads
    // as chrome, which no street lamp is.
    ;(lampMesh.material as THREE.MeshStandardMaterial).roughness = 0.62
    group.add(lampMesh)
  }

  if (authoredCanopy && canopies.length > 0) {
    const mesh = new THREE.InstancedMesh(
      authoredCanopy.clone(),
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.7 }),
      canopies.length,
    )
    mesh.name = 'osm-platform-canopies'
    const cs = new THREE.Vector3()
    canopies.forEach((spot, i) => {
      p.set(spot.x, spot.y, spot.z)
      q.setFromAxisAngle(zAxis, spot.yaw)
      // Only across: stretching a shelter lengthways would stretch its columns
      // with it, and a leaning column is worse than a shelter of the wrong size.
      cs.set(mToN, mToN * spot.widthScale, mToN)
      mesh.setMatrixAt(i, m.compose(p, q, cs))
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  const vehicles = cars.length + carriages.length
  return {
    object: group,
    count: vehicles + lamps.length + canopies.length,
    counts: { vehicles, lamps: lamps.length, canopies: canopies.length },
  }
}
