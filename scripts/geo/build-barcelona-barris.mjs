// Generates src/lib/geo/barcelona-barris.data.ts — the 73 barris (and the
// district each belongs to) of the municipality of Barcelona as compact,
// simplified polygons, for the urban-typology lookup in barcelona-barris.ts.
//
// SOURCE
//   OpenStreetMap administrative boundaries, © OpenStreetMap contributors,
//   licensed under the Open Database License (ODbL 1.0) —
//   https://www.openstreetmap.org/copyright. Districts are admin_level=9,
//   barris admin_level=10, inside the admin_level=8 area "Barcelona".
//   The Overpass `area[name=Barcelona]` also matches Barcelona (Anzoátegui,
//   Venezuela), so relations are kept only when they fall inside the
//   Catalan bbox below.
//
// REGENERATE (offline once the raw JSON exists):
//   1. Fetch once (Overpass is rate-limited — keep the file, never refetch):
//        node scripts/geo/build-barcelona-barris.mjs --fetch raw-bcn-admin.json
//      or run QUERY (printed with --query) by hand at overpass-turbo.eu and
//      save the JSON.
//   2. Build:
//        node scripts/geo/build-barcelona-barris.mjs raw-bcn-admin.json
//   The output is deterministic for a given input file.
//
// ALGORITHM
//   • Each boundary WAY is simplified once (Douglas-Peucker in local metres,
//     TOLERANCE_M, endpoints pinned) and cached by way id — two neighbouring
//     barris share the same ways, so they share the same simplified edge and
//     no slivers/gaps open between them.
//   • Each relation's outer/inner member ways (unordered, possibly reversed)
//     are chained end-to-end into closed rings by matching endpoints.
//   • Coordinates are rounded to 5 decimals (≈1.1 m) and stored as integer
//     1e-5° units, delta-encoded: [lat0, lon0, dLat1, dLon1, ...]. Holes are
//     stored as extra rings; the lookup uses the even-odd rule.
//   • The district of a barri is the admin_level=9 relation containing an
//     interior point of the barri (checked against the official numbering).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'src/lib/geo/barcelona-barris.data.ts')

const QUERY = '[out:json][timeout:180];area["boundary"="administrative"]["admin_level"="8"]["name"="Barcelona"]->.bcn;rel(area.bcn)["boundary"="administrative"]["admin_level"~"^(9|10)$"];out geom;'
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
/** Coarse Catalan window used only to drop the Venezuelan namesake. */
const KEEP_BBOX = { minLat: 41.2, maxLat: 41.6, minLon: 1.9, maxLon: 2.4 }
const TOLERANCE_M = 10
const Q = 1e5 // 5 decimals

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
if (args[0] === '--query') { console.log(QUERY); process.exit(0) }
if (args[0] === '--fetch') { await fetchRaw(args[1]); process.exit(0) }
if (!args[0]) {
  console.error('usage: node scripts/geo/build-barcelona-barris.mjs <raw-overpass.json>\n' +
    '       node scripts/geo/build-barcelona-barris.mjs --fetch <out.json>\n' +
    '       node scripts/geo/build-barcelona-barris.mjs --query')
  process.exit(2)
}

async function fetchRaw(out) {
  if (!out) throw new Error('--fetch needs an output path')
  for (let i = 0; i < 6; i++) {
    const ep = ENDPOINTS[i % ENDPOINTS.length]
    try {
      const r = await fetch(ep, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(QUERY),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(200_000),
      })
      const t = await r.text()
      if (r.ok && t.trimStart().startsWith('{')) { writeFileSync(out, t); console.log('saved', out); return }
      console.warn(`attempt ${i + 1} ${ep}: HTTP ${r.status}`)
    } catch (e) { console.warn(`attempt ${i + 1} ${ep}: ${e.message}`) }
    await new Promise((res) => setTimeout(res, 25_000))
  }
  throw new Error('Overpass fetch failed after retries')
}

// ── Geometry helpers ────────────────────────────────────────────────────────
const LAT0 = 41.39
const M_PER_DEG_LAT = 111_320
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180)
const toXY = (p) => [p.lon * M_PER_DEG_LON, p.lat * M_PER_DEG_LAT]

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = dx * dx + dy * dy
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Douglas-Peucker on an open polyline (endpoints kept). Returns kept indices mask. */
function dpOpen(xy, tol) {
  const keep = new Uint8Array(xy.length)
  keep[0] = keep[xy.length - 1] = 1
  const stack = [[0, xy.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let best = -1, bi = -1
    for (let i = s + 1; i < e; i++) {
      const d = segDist(xy[i], xy[s], xy[e])
      if (d > best) { best = d; bi = i }
    }
    if (best > tol) { keep[bi] = 1; stack.push([s, bi], [bi, e]) }
  }
  return keep
}

/** Simplify one way's geometry; a closed way is split at its farthest vertex. */
function simplifyWay(geom) {
  const pts = geom.map((g) => ({ lat: g.lat, lon: g.lon }))
  if (pts.length <= 2) return pts
  const xy = pts.map(toXY)
  const closed = pts[0].lat === pts.at(-1).lat && pts[0].lon === pts.at(-1).lon
  let keep
  if (closed) {
    let far = 1, fd = -1
    for (let i = 1; i < xy.length - 1; i++) {
      const d = Math.hypot(xy[i][0] - xy[0][0], xy[i][1] - xy[0][1])
      if (d > fd) { fd = d; far = i }
    }
    const a = dpOpen(xy.slice(0, far + 1), TOLERANCE_M)
    const b = dpOpen(xy.slice(far), TOLERANCE_M)
    keep = new Uint8Array(xy.length)
    a.forEach((k, i) => { if (k) keep[i] = 1 })
    b.forEach((k, i) => { if (k) keep[far + i] = 1 })
  } else {
    keep = dpOpen(xy, TOLERANCE_M)
  }
  return pts.filter((_, i) => keep[i])
}

const key = (p) => `${Math.round(p.lat * 1e7)},${Math.round(p.lon * 1e7)}`

/** Chain unordered, possibly reversed polylines into closed rings. */
function assembleRings(lines, label) {
  const pool = lines.filter((l) => l.length >= 2).map((l) => l.slice())
  const rings = []
  while (pool.length) {
    let ring = pool.shift()
    let guard = 0
    while (key(ring[0]) !== key(ring.at(-1))) {
      const endK = key(ring.at(-1))
      let idx = pool.findIndex((l) => key(l[0]) === endK)
      let rev = false
      if (idx < 0) { idx = pool.findIndex((l) => key(l.at(-1)) === endK); rev = true }
      if (idx < 0) {
        // Try growing from the other end before giving up.
        const startK = key(ring[0])
        let j = pool.findIndex((l) => key(l.at(-1)) === startK)
        let rj = false
        if (j < 0) { j = pool.findIndex((l) => key(l[0]) === startK); rj = true }
        if (j < 0) { console.warn(`  ! ${label}: open ring (${ring.length} pts), closing it`); break }
        const seg = pool.splice(j, 1)[0]
        const s = rj ? seg.slice().reverse() : seg
        ring = s.concat(ring.slice(1))
        continue
      }
      const seg = pool.splice(idx, 1)[0]
      const s = rev ? seg.slice().reverse() : seg
      ring = ring.concat(s.slice(1))
      if (++guard > 100_000) throw new Error('ring assembly runaway')
    }
    if (key(ring[0]) === key(ring.at(-1))) ring = ring.slice(0, -1)
    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}

function pointInRings(lat, lon, rings) {
  let inside = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j]
      if ((a.lat > lat) !== (b.lat > lat) &&
          lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
    }
  }
  return inside
}

function interiorPoint(rings) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const r of rings) for (const p of r) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon)
  }
  // Scan a grid from the centre outwards; pick the first inside point.
  const cand = []
  for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
    const lat = minLat + ((maxLat - minLat) * i) / 40
    const lon = minLon + ((maxLon - minLon) * j) / 40
    cand.push({ lat, lon, d: (i - 20) ** 2 + (j - 20) ** 2 })
  }
  cand.sort((a, b) => a.d - b.d)
  return cand.find((c) => pointInRings(c.lat, c.lon, rings)) ?? null
}

function ringArea(r) {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = toXY(r[j]), [x2, y2] = toXY(r[i])
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

// ── Build ───────────────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(resolve(args[0]), 'utf8'))
const inKeep = (rel) => {
  const g = rel.members?.find((m) => m.geometry?.length)?.geometry?.[0]
  return g && g.lat > KEEP_BBOX.minLat && g.lat < KEEP_BBOX.maxLat && g.lon > KEEP_BBOX.minLon && g.lon < KEEP_BBOX.maxLon
}
const rels = raw.elements.filter((e) => e.type === 'relation' && inKeep(e))

const wayCache = new Map()
function relRings(rel, simplified) {
  const lines = []
  for (const m of rel.members) {
    if (m.type !== 'way' || !m.geometry?.length) continue
    if (m.role && m.role !== 'outer' && m.role !== 'inner') continue
    if (!simplified) { lines.push(m.geometry.map((g) => ({ lat: g.lat, lon: g.lon }))); continue }
    if (!wayCache.has(m.ref)) wayCache.set(m.ref, simplifyWay(m.geometry))
    lines.push(wayCache.get(m.ref))
  }
  return assembleRings(lines, rel.tags.name)
}

const districts = rels
  .filter((r) => r.tags.admin_level === '9' && r.tags.name !== 'Barcelona')
  .map((r) => ({ name: r.tags.name, ref: Number(r.tags.ref), rings: relRings(r, false) }))
  .sort((a, b) => a.ref - b.ref)
const barrisRaw = rels
  .filter((r) => r.tags.admin_level === '10')
  .sort((a, b) => Number(a.tags.ref) - Number(b.tags.ref))

console.log(`districts: ${districts.length}  barris: ${barrisRaw.length}`)
if (districts.length !== 10) console.warn(`  ! expected 10 districts, got ${districts.length}`)
if (barrisRaw.length !== 73) console.warn(`  ! expected 73 barris, got ${barrisRaw.length}`)

let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
let vertexCount = 0
const barris = barrisRaw.map((rel) => {
  const name = rel.tags.name
  const fullRings = relRings(rel, false)
  const ip = interiorPoint(fullRings)
  const dist = ip && districts.find((d) => pointInRings(ip.lat, ip.lon, d.rings))
  if (!dist) throw new Error(`no district for ${name}`)
  const rings = relRings(rel, true)
    .map((r) => r.map((p) => ({ lat: Math.round(p.lat * Q), lon: Math.round(p.lon * Q) })))
    // drop duplicate consecutive vertices introduced by rounding
    .map((r) => r.filter((p, i) => i === 0 || p.lat !== r[i - 1].lat || p.lon !== r[i - 1].lon))
    .filter((r) => r.length >= 3)
    // outer (largest) first
    .sort((a, b) => Math.abs(ringArea(b.map((p) => ({ lat: p.lat / Q, lon: p.lon / Q })))) -
                    Math.abs(ringArea(a.map((p) => ({ lat: p.lat / Q, lon: p.lon / Q })))))
  const enc = rings.map((r) => {
    const out = []
    let pl = 0, pn = 0
    r.forEach((p, i) => {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon)
      out.push(i === 0 ? p.lat : p.lat - pl, i === 0 ? p.lon : p.lon - pn)
      pl = p.lat; pn = p.lon
    })
    vertexCount += r.length
    return out
  })
  return { name, ref: Number(rel.tags.ref), d: districts.indexOf(dist), enc }
})

// Sanity: the official numbering puts barris 1-4 in district 1, 5-10 in 2, …
const OFFICIAL_FIRST = [1, 5, 11, 19, 22, 28, 33, 44, 57, 64, 74]
for (const b of barris) {
  const want = OFFICIAL_FIRST.findIndex((f, i) => b.ref >= f && b.ref < OFFICIAL_FIRST[i + 1])
  if (want !== b.d) console.warn(`  ! ${b.name} (#${b.ref}) → ${districts[b.d].name}, official district #${want + 1}`)
}

const lines = []
lines.push('// GENERATED by scripts/geo/build-barcelona-barris.mjs — do not edit by hand.')
lines.push('// Source: OpenStreetMap administrative boundaries (admin_level 9/10) of the')
lines.push('// municipality of Barcelona. © OpenStreetMap contributors, ODbL 1.0.')
lines.push(`// Simplified with Douglas-Peucker at ${TOLERANCE_M} m per shared way; ${vertexCount} vertices.`)
lines.push('// Ring encoding: integer 1e-5° units, [lat0, lon0, dLat1, dLon1, …] (delta).')
lines.push('// Extra rings are holes/exclaves — test with the even-odd rule.')
lines.push('')
lines.push('/** Municipality bbox in degrees: [minLat, minLon, maxLat, maxLon]. */')
lines.push(`export const BCN_BBOX = [${minLat / Q}, ${minLon / Q}, ${maxLat / Q}, ${maxLon / Q}] as const`)
lines.push('')
lines.push('/** The 10 districts, index = official district number − 1. */')
lines.push(`export const BCN_DISTRICTS = ${JSON.stringify(districts.map((d) => d.name))} as const`)
lines.push('')
lines.push('export interface BarriRecord {')
lines.push('  /** Barri name exactly as tagged in OSM. */')
lines.push('  readonly n: string')
lines.push('  /** Official barri number (1..73). */')
lines.push('  readonly c: number')
lines.push('  /** Index into BCN_DISTRICTS. */')
lines.push('  readonly d: number')
lines.push('  /** Delta-encoded rings (see header). */')
lines.push('  readonly r: readonly (readonly number[])[]')
lines.push('}')
lines.push('')
lines.push('export const BCN_BARRIS: readonly BarriRecord[] = [')
for (const b of barris) {
  lines.push(`{n:${JSON.stringify(b.name)},c:${b.ref},d:${b.d},r:[${b.enc.map((r) => `[${r.join(',')}]`).join(',')}]},`)
}
lines.push(']')
lines.push('')
const text = lines.join('\n')
writeFileSync(OUT, text)
console.log(`wrote ${OUT} — ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB, ${vertexCount} vertices, ${wayCache.size} ways`)
