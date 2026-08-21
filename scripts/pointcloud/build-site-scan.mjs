// ─── build-site-scan.mjs ──────────────────────────────────────────────────────
// Writes the survey scan that goes with the Poblenou Pavilion:
//
//   npm run site-scan     →  public/models/poblenou/poblenou-site-scan.las
//
// WHY THIS FILE EXISTS. The honesty note at the top of demo-models/point-clouds.ts
// says it plainly: every public demo scan is a capture of somewhere real, none of
// them is a scan OF a demo model, so loading one beside an IFC lands on the
// bottom rung of the alignment ladder — "placed by hand". That is the correct
// answer and a useless demo. There is no public IFC/scan pair of the same place
// to fix it with, so this is ours.
//
// It is written in EPSG:25831, the same projected CRS the pavilion's
// IfcMapConversion declares, at the same eastings and northings. That is the
// entire trick: two files that agree about where they are reach the TOP rung of
// pc-align (shared CRS), and the cloud lands on the model to the centimetre
// without anybody dragging anything.
//
// WHAT IS IN IT — a site survey taken mid-construction, which is when a scan of
// a building actually happens:
//
//     ground and street around the plot          class 2, ~60k
//     neighbouring block facades                 class 6, ~44k
//     street trees                               class 5, ~12k
//     the pavilion's own concrete frame          class 6, ~34k
//
// The frame points are sampled on the surfaces of the STRUCTURAL model's
// columns, beams and slab edges, so loading the scan with BCN-IVO-…-S-0001.ifc
// puts a scanned column exactly where the modelled column is. That comparison —
// as-built against as-designed — is the thing the feature is for, and it is what
// no pair of files in the demo set could show before.
//
// THE NUMBERS BELOW MIRROR build-district.py. They are declared here rather than
// parsed out of the IFC because a LAS writer that also parses STEP is two
// programs; the coupling is guarded instead by site-scan.test.ts, which reads
// BOTH files and asserts the scan's points land on the model's surfaces. If the
// building moves and this file does not, that test fails.
//
// DETERMINISTIC. A seeded PRNG, no Date, no Math.random — rebuilding produces a
// byte-identical file, for the same reason the IFC builds do: this is committed
// and asserted against, and a rebuild that churns 4 MB is not a rebuild anybody
// will run.

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// ── Where on earth, and how the model sits on it ─────────────────────────────
// Straight out of build-district.py's georeferencing block.

const EPSG = 25831
const EASTINGS = 432290.0
const NORTHINGS = 4584167.0
const HEIGHT = 12.5
const GRID_ROTATION_DEG = 45.0

// ── The building, in project metres (mirrors build-district.py) ──────────────

const GRID_X = [0.0, 7.2, 14.4, 21.6, 28.8, 36.0]
const GRID_Y = [0.0, 7.2, 14.4, 21.6]
const WIDTH = 36.0
const DEPTH = 21.6
const LEVEL_Z = { Ground: 0.0, 'Level 01': 4.2, 'Level 02': 8.4, Roof: 12.6 }
const SLAB_T = 0.3
const COLUMN = 0.4

/** Survey extent, in project metres. Wide enough to catch the street both sides. */
const AREA = { x0: -24, y0: -24, x1: 60, y1: 46 }
/** Ground level just outside the building — the plot sits 200 mm proud. */
const GROUND_Z = -0.2

// ── Neighbouring blocks, as (x0, y0, x1, y1, height) in project metres ───────
// Across the street on three sides. Their facades are what a terrestrial
// scanner sees most of, and what makes the cloud read as a place rather than a
// floating object.

const NEIGHBOURS = [
  [-24, -24, -6, -4, 16],
  [6, -24, 44, -6, 19],
  [46, 2, 60, 34, 13],
  [-24, 8, -8, 40, 15],
  [4, 34, 40, 46, 17],
]

/** Street trees: [x, y, trunk height, canopy radius]. */
const TREES = [
  [-3, -12, 2.6, 2.4], [10, -12, 2.4, 2.2], [23, -12, 2.7, 2.5], [36, -12, 2.5, 2.3],
  [-12, 4, 2.6, 2.4], [-12, 18, 2.4, 2.2], [44, 6, 2.5, 2.3], [44, 20, 2.7, 2.5],
]

// ── Point classes: LAS ASN.1 class, RGB, base intensity ──────────────────────

const CLASSES = {
  ground: { code: 2, rgb: [118, 112, 104], intensity: 9000 },
  building: { code: 6, rgb: [176, 168, 156], intensity: 15000 },
  vegetation: { code: 5, rgb: [86, 124, 68], intensity: 6500 },
  concrete: { code: 6, rgb: [198, 196, 192], intensity: 21000 },
}

// ── A seeded PRNG, so the file is the same one tomorrow ──────────────────────

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(0x504f424c) // "POBL"
const jitter = (spread) => (rand() - 0.5) * 2 * spread

// ── The scan ─────────────────────────────────────────────────────────────────

const points = []

function push(x, y, z, kind, intensityJitter = 0.18) {
  const c = CLASSES[kind]
  const wobble = 1 + jitter(intensityJitter)
  points.push({
    x, y, z,
    intensity: Math.max(0, Math.min(65535, Math.round(c.intensity * wobble))),
    classification: c.code,
    r: clampColour(c.rgb[0] * wobble),
    g: clampColour(c.rgb[1] * wobble),
    b: clampColour(c.rgb[2] * wobble),
  })
}

function clampColour(v) {
  // LAS stores colour as 16-bit; 8-bit values scaled by 257 is the convention
  // every viewer understands, and what makes 255 come back as full white.
  return Math.max(0, Math.min(65535, Math.round(Math.max(0, Math.min(255, v)) * 257)))
}

/** Ground height at a point: a gentle fall toward the sea, plus scanner noise. */
function groundAt(x, y) {
  return GROUND_Z - 0.008 * (y - 10) + 0.004 * Math.sin(x * 0.12) + jitter(0.012)
}

function insideBuilding(x, y) {
  return x > -1 && x < WIDTH + 1 && y > -1 && y < DEPTH + 1
}

function scanGround(count) {
  let placed = 0
  while (placed < count) {
    const x = AREA.x0 + rand() * (AREA.x1 - AREA.x0)
    const y = AREA.y0 + rand() * (AREA.y1 - AREA.y0)
    // The plot itself is a building site: its ground was never scanned, the
    // frame was. Leaving the footprint empty is what a real capture looks like.
    if (insideBuilding(x, y)) continue
    if (NEIGHBOURS.some(([bx0, by0, bx1, by1]) => x > bx0 && x < bx1 && y > by0 && y < by1)) continue
    push(x, y, groundAt(x, y), 'ground')
    placed++
  }
}

/** Points on the four vertical faces of a box, thinning with height. */
function scanFacades(count) {
  const perimeter = NEIGHBOURS.reduce((n, [x0, y0, x1, y1]) => n + 2 * (x1 - x0 + y1 - y0), 0)
  for (const [x0, y0, x1, y1, height] of NEIGHBOURS) {
    const share = Math.round(count * (2 * (x1 - x0 + y1 - y0)) / perimeter)
    for (let i = 0; i < share; i++) {
      // Height distribution biased low: a tripod scanner sees the bottom of a
      // facade far better than the top, and a cloud that ignores that reads as
      // a texture rather than a capture.
      const z = groundAt((x0 + x1) / 2, (y0 + y1) / 2) + Math.pow(rand(), 1.6) * height
      const along = rand()
      const side = Math.floor(rand() * 4)
      let x, y
      if (side === 0) { x = x0 + along * (x1 - x0); y = y0 }
      else if (side === 1) { x = x0 + along * (x1 - x0); y = y1 }
      else if (side === 2) { x = x0; y = y0 + along * (y1 - y0) }
      else { x = x1; y = y0 + along * (y1 - y0) }
      push(x + jitter(0.02), y + jitter(0.02), z, 'building')
    }
  }
}

function scanTrees(count) {
  const per = Math.round(count / TREES.length)
  for (const [cx, cy, trunk, radius] of TREES) {
    const base = groundAt(cx, cy)
    for (let i = 0; i < per; i++) {
      if (i < per * 0.12) {
        const a = rand() * Math.PI * 2
        push(cx + Math.cos(a) * 0.16 + jitter(0.02), cy + Math.sin(a) * 0.16 + jitter(0.02),
             base + rand() * trunk, 'vegetation', 0.3)
      } else {
        // A canopy shell rather than a solid ball — a scanner only ever sees
        // leaves, never the inside of a tree.
        const a = rand() * Math.PI * 2
        const b = Math.acos(2 * rand() - 1)
        const rr = radius * (0.78 + rand() * 0.22)
        push(cx + rr * Math.sin(b) * Math.cos(a), cy + rr * Math.sin(b) * Math.sin(a),
             base + trunk + radius * 0.9 + rr * Math.cos(b) * 0.8, 'vegetation', 0.35)
      }
    }
  }
}

/**
 * The pavilion's own frame: the surfaces a scanner standing inside it would
 * actually hit — column faces, slab soffits and slab edges. These are the
 * points that must land ON the structural model, and site-scan.test.ts checks
 * that they do.
 */
function scanFrame(count) {
  const levels = ['Ground', 'Level 01', 'Level 02', 'Roof']
  const half = COLUMN / 2
  const columnShare = Math.round(count * 0.45)
  const slabShare = count - columnShare

  for (let i = 0; i < columnShare; i++) {
    const gx = GRID_X[Math.floor(rand() * GRID_X.length)]
    const gy = GRID_Y[Math.floor(rand() * GRID_Y.length)]
    const li = Math.floor(rand() * 3)
    const base = LEVEL_Z[levels[li]]
    const top = LEVEL_Z[levels[li + 1]] - SLAB_T - 0.6
    const z = base + rand() * (top - base)
    const side = Math.floor(rand() * 4)
    const along = (rand() - 0.5) * COLUMN
    const faces = [
      [gx + along, gy - half], [gx + along, gy + half],
      [gx - half, gy + along], [gx + half, gy + along],
    ]
    const [x, y] = faces[side]
    push(x + jitter(0.006), y + jitter(0.006), z, 'concrete', 0.12)
  }

  for (let i = 0; i < slabShare; i++) {
    const level = levels[1 + Math.floor(rand() * 3)]
    const z = LEVEL_Z[level]
    if (rand() < 0.65) {
      // Soffit: the underside, which is what you see from the floor below.
      push(rand() * WIDTH, rand() * DEPTH, z - SLAB_T + jitter(0.006), 'concrete', 0.12)
    } else {
      // Edge: the 300 mm band around the slab perimeter.
      const along = rand()
      const side = Math.floor(rand() * 4)
      const edgeZ = z - rand() * SLAB_T
      if (side === 0) push(along * WIDTH, 0 + jitter(0.006), edgeZ, 'concrete', 0.12)
      else if (side === 1) push(along * WIDTH, DEPTH + jitter(0.006), edgeZ, 'concrete', 0.12)
      else if (side === 2) push(0 + jitter(0.006), along * DEPTH, edgeZ, 'concrete', 0.12)
      else push(WIDTH + jitter(0.006), along * DEPTH, edgeZ, 'concrete', 0.12)
    }
  }
}

// ── Project metres → EPSG:25831 grid metres ──────────────────────────────────

function toMapGrid(points) {
  const t = (GRID_ROTATION_DEG * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  return points.map((p) => ({
    ...p,
    x: EASTINGS + p.x * cos - p.y * sin,
    y: NORTHINGS + p.x * sin + p.y * cos,
    z: HEIGHT + p.z,
  }))
}

// ── LAS 1.2, point data record format 2 (XYZ + intensity + RGB) ──────────────

const HEADER_SIZE = 227
const POINT_SIZE = 26
const SCALE = 0.001 // millimetre resolution, which is what a survey delivers

/**
 * The GeoTIFF key directory that says "these coordinates are EPSG:25831, in
 * metres". Without it the reader has no CRS, the aligner drops to "placed by
 * hand", and the whole point of this file is gone.
 */
function geoKeyDirectory() {
  const keys = [
    [1, 1, 0, 3], // KeyDirectoryVersion, KeyRevision, MinorRevision, NumberOfKeys
    [1024, 0, 1, 1], // GTModelType = projected
    [3072, 0, 1, EPSG], // ProjectedCSTypeGeoKey
    [3076, 0, 1, 9001], // ProjLinearUnits = metre
  ]
  const buf = Buffer.alloc(keys.length * 8)
  keys.forEach((key, i) => key.forEach((v, j) => buf.writeUInt16LE(v, i * 8 + j * 2)))
  return buf
}

function vlr(userId, recordId, description, payload) {
  const head = Buffer.alloc(54)
  head.writeUInt16LE(0, 0) // reserved
  head.write(userId, 2, 16, 'ascii')
  head.writeUInt16LE(recordId, 18)
  head.writeUInt16LE(payload.length, 20)
  head.write(description, 22, 32, 'ascii')
  return Buffer.concat([head, payload])
}

function writeLas(filePath, points) {
  const vlrs = Buffer.concat([
    vlr('LASF_Projection', 34735, 'GeoTIFF GeoKeyDirectoryTag', geoKeyDirectory()),
  ])
  const offsetToPointData = HEADER_SIZE + vlrs.length

  const bounds = points.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
    minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y),
    minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity })

  // Offsets are rounded down to a whole metre: it keeps the header readable and
  // the scaled integers well inside int32 either way.
  const offset = { x: Math.floor(bounds.minX), y: Math.floor(bounds.minY), z: Math.floor(bounds.minZ) }

  const header = Buffer.alloc(HEADER_SIZE)
  header.write('LASF', 0, 4, 'ascii')
  header.writeUInt16LE(0, 4) // file source id
  header.writeUInt16LE(0, 6) // global encoding — GPS week time, no WKT
  header.write('IFC Viewer Online', 26, 32, 'ascii') // generating software … system id
  header.write('build-site-scan.mjs', 58, 32, 'ascii')
  header.writeUInt8(1, 24) // version major
  header.writeUInt8(2, 25) // version minor
  // Creation day/year: frozen, like the IFC header timestamps, so the build is
  // reproducible. 2026-08-09 is day 221.
  header.writeUInt16LE(221, 90)
  header.writeUInt16LE(2026, 92)
  header.writeUInt16LE(HEADER_SIZE, 94)
  header.writeUInt32LE(offsetToPointData, 96)
  header.writeUInt32LE(1, 100) // number of VLRs
  header.writeUInt8(2, 104) // point data record format 2
  header.writeUInt16LE(POINT_SIZE, 105)
  header.writeUInt32LE(points.length, 107)
  for (let i = 0; i < 5; i++) header.writeUInt32LE(i === 0 ? points.length : 0, 111 + i * 4)
  header.writeDoubleLE(SCALE, 131)
  header.writeDoubleLE(SCALE, 139)
  header.writeDoubleLE(SCALE, 147)
  header.writeDoubleLE(offset.x, 155)
  header.writeDoubleLE(offset.y, 163)
  header.writeDoubleLE(offset.z, 171)
  header.writeDoubleLE(bounds.maxX, 179)
  header.writeDoubleLE(bounds.minX, 187)
  header.writeDoubleLE(bounds.maxY, 195)
  header.writeDoubleLE(bounds.minY, 203)
  header.writeDoubleLE(bounds.maxZ, 211)
  header.writeDoubleLE(bounds.minZ, 219)

  const body = Buffer.alloc(points.length * POINT_SIZE)
  points.forEach((p, i) => {
    const at = i * POINT_SIZE
    body.writeInt32LE(Math.round((p.x - offset.x) / SCALE), at)
    body.writeInt32LE(Math.round((p.y - offset.y) / SCALE), at + 4)
    body.writeInt32LE(Math.round((p.z - offset.z) / SCALE), at + 8)
    body.writeUInt16LE(p.intensity, at + 12)
    body.writeUInt8(0b00001001, at + 14) // return 1 of 1
    body.writeUInt8(p.classification, at + 15)
    body.writeInt8(0, at + 16) // scan angle rank
    body.writeUInt8(0, at + 17) // user data
    body.writeUInt16LE(1, at + 18) // point source id
    body.writeUInt16LE(p.r, at + 20)
    body.writeUInt16LE(p.g, at + 22)
    body.writeUInt16LE(p.b, at + 24)
  })

  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, Buffer.concat([header, vlrs, body]))
  return { bytes: HEADER_SIZE + vlrs.length + body.length, bounds }
}

// ── Build ────────────────────────────────────────────────────────────────────

const out = path.resolve(process.argv[2] ?? 'public/models/poblenou/poblenou-site-scan.las')

scanGround(60_000)
scanFacades(44_000)
scanTrees(12_000)
scanFrame(34_000)

const mapped = toMapGrid(points)
const { bytes, bounds } = writeLas(out, mapped)

const byClass = mapped.reduce((acc, p) => ({ ...acc, [p.classification]: (acc[p.classification] ?? 0) + 1 }), {})
console.log(
  `\n  OK ${path.basename(out)} — LAS 1.2 · PDRF 2 · EPSG:${EPSG}` +
  `\n     ${mapped.length.toLocaleString('en-US')} points, ${(bytes / 1024 / 1024).toFixed(2)} MB` +
  `\n     classes: ${Object.entries(byClass).map(([c, n]) => `${c}=${n}`).join(', ')}` +
  `\n     extent: ${(bounds.maxX - bounds.minX).toFixed(1)} x ${(bounds.maxY - bounds.minY).toFixed(1)}` +
  ` x ${(bounds.maxZ - bounds.minZ).toFixed(1)} m` +
  `\n     -> ${out}\n`,
)
