// Bakes the bare-earth ground of urban Shanghai into src/lib/geo/shanghai-ground-data.ts.
//
// Source: DeltaDTM v1.1 (Pronk et al. 2024, CC BY 4.0), a 1-arcsecond global
// coastal terrain model, heights in metres above EGM2008. The tile lives
// uncompressed inside a 17 GB zip on 4TU.ResearchData; the server honours range
// requests, so only the blocks over the city are read.
//
//   node scripts/bake-shanghai-ground.mjs            fetch (cached) + write the module
//   node scripts/bake-shanghai-ground.mjs --stats    also print what the raster holds
//
// The 1" raster is not meshed as it is: its cell-to-cell spread over the city
// (about ±0.7 m) is interpolation noise, not landform. Each output cell is the
// median of a 9" block, which is what the data can honestly support.

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, '.tmp-terrain', 'deltadtm-shanghai.f32')
const OUT = path.join(ROOT, 'src', 'lib', 'geo', 'shanghai-ground-data.ts')

const ZIP_URL = 'https://data.4tu.nl/file/1da2e70f-6c4d-4b03-86bd-b53e789cc629/672eba4c-1334-44c6-8119-8879ded25912'
/** Offset of DeltaDTM_v1_1_N31E121.tif's local header inside Asia.zip. */
const ZIP_LOCAL_HEADER = 7647924415

// Baked box. Inside the one DeltaDTM tile (31–32 N, 121–122 E).
const SOUTH = 31.0, NORTH = 31.45, WEST = 121.2, EAST = 121.8
/** Output cell, arcseconds. */
const CELL = 9
/** Byte encoding: metres = (byte − OFFSET) / SCALE; 255 = no land (open water). */
const OFFSET = 30, SCALE = 10, NODATA = 255

async function range(a, len) {
  const r = await fetch(ZIP_URL, { headers: { Range: `bytes=${a}-${a + len - 1}` } })
  if (r.status !== 206) throw new Error('range request: HTTP ' + r.status)
  return Buffer.from(await r.arrayBuffer())
}

/** The 1" raster over the box, row 0 = north, as Float32 (NaN = nodata). */
async function fetchRaster(cols, rows) {
  const lh = await range(ZIP_LOCAL_HEADER, 30)
  const base = ZIP_LOCAL_HEADER + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28)
  const rd = (o, l) => range(base + o, l)
  const head = await rd(0, 65536)
  if (head.toString('ascii', 0, 2) !== 'II' || head.readUInt16LE(2) !== 42) throw new Error('expected a little-endian classic TIFF')
  const ifd = head.readUInt32LE(4)
  const n = head.readUInt16LE(ifd)
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8 }
  const tags = {}
  for (let i = 0; i < n; i++) {
    const p = ifd + 2 + i * 12
    const tag = head.readUInt16LE(p), type = head.readUInt16LE(p + 2), cnt = head.readUInt32LE(p + 4)
    const bytes = cnt * (size[type] ?? 1)
    const data = bytes <= 4 ? head.subarray(p + 8, p + 8 + bytes) : await rd(head.readUInt32LE(p + 8), bytes)
    const vals = []
    for (let k = 0; k < cnt; k++) {
      const o = k * (size[type] ?? 1)
      vals.push(type === 3 ? data.readUInt16LE(o) : type === 4 ? data.readUInt32LE(o) : type === 12 ? data.readDoubleLE(o) : type === 11 ? data.readFloatLE(o) : data[o])
    }
    tags[tag] = type === 2 ? Buffer.from(vals).toString('ascii') : vals
  }
  const W = tags[256][0], TW = tags[322][0], TH = tags[323][0]
  if (tags[259][0] !== 50000 || tags[317][0] !== 3 || tags[258][0] !== 32) throw new Error('expected ZSTD + float predictor, 32 bit')
  const sx = tags[33550][0], sy = tags[33550][1], x0 = tags[33922][3], y0 = tags[33922][4]
  const nodata = parseFloat(tags[42113])
  const across = Math.ceil(W / TW)
  const blocks = new Map()
  async function block(tx, ty) {
    const k = ty * across + tx
    if (blocks.has(k)) return blocks.get(k)
    const d = zlib.zstdDecompressSync(await rd(tags[324][k], tags[325][k]))
    const out = Buffer.alloc(d.length)
    for (let r = 0; r < TH; r++) {
      const row = d.subarray(r * TW * 4, (r + 1) * TW * 4)
      for (let i = 1; i < row.length; i++) row[i] = (row[i] + row[i - 1]) & 255
      for (let c = 0; c < TW; c++) for (let b = 0; b < 4; b++) out[(r * TW + c) * 4 + b] = row[(3 - b) * TW + c]
    }
    blocks.set(k, out)
    return out
  }
  const c0 = Math.round((WEST - x0) / sx), r0 = Math.round((y0 - NORTH) / sy)
  const g = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const C = c0 + c, R = r0 + r
      const t = await block(Math.floor(C / TW), Math.floor(R / TH))
      const v = t.readFloatLE(((R % TH) * TW + (C % TW)) * 4)
      g[r * cols + c] = v === nodata || Number.isNaN(v) ? NaN : v
    }
  }
  return g
}

const cols = Math.round((EAST - WEST) * 3600), rows = Math.round((NORTH - SOUTH) * 3600)
let raster
if (fs.existsSync(CACHE)) {
  const b = fs.readFileSync(CACHE)
  raster = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
} else {
  raster = await fetchRaster(cols, rows)
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, Buffer.from(raster.buffer))
}
if (raster.length !== cols * rows) throw new Error('cache does not match the box; delete ' + CACHE)

const at = (lat, lon) => raster[Math.floor((NORTH - lat) * 3600) * cols + Math.floor((lon - WEST) * 3600)]
if (process.argv.includes('--stats')) {
  const v = Array.from(raster).filter(Number.isFinite).sort((a, b) => a - b)
  const q = (p) => v[Math.floor(p * (v.length - 1))].toFixed(2)
  console.log(`1" raster ${cols}×${rows}: nodata ${(100 - (v.length / raster.length) * 100).toFixed(1)}%  min ${q(0)} p5 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} max ${q(1)}`)
  const pts = { 'Huangpu (off the Bund)': [31.2385, 121.4955], 'Huangpu (Xuhui bend)': [31.178, 121.468], 'Suzhou Creek': [31.2437, 121.47], 'Fuxing Park': [31.219, 121.469], 'Yangtze': [31.42, 121.6], 'Century Park lake': [31.2165, 121.5505] }
  for (const k in pts) console.log(' ', k.padEnd(24), at(...pts[k]).toFixed(2))
}

// Block medians, and which cells have water in or beside them.
const oc = cols / CELL, or = rows / CELL
const bytes = new Uint8Array(oc * or)
const wet = new Uint8Array(oc * or)
const block = []
let land = 0
for (let r = 0; r < or; r++) {
  for (let c = 0; c < oc; c++) {
    block.length = 0
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const v = raster[(r * CELL + y) * cols + c * CELL + x]
      if (Number.isFinite(v)) block.push(v)
    }
    if (block.length < CELL * CELL) wet[r * oc + c] = 1
    if (block.length < (CELL * CELL) / 2) { bytes[r * oc + c] = NODATA; continue }
    block.sort((a, b) => a - b)
    const m = block[block.length >> 1]
    bytes[r * oc + c] = Math.max(0, Math.min(254, Math.round(m * SCALE + OFFSET)))
    land++
  }
}
// One bit per cell: water in this cell or in one of the eight around it.
const bits = new Uint8Array(Math.ceil((oc * or) / 8))
let nearWater = 0
for (let r = 0; r < or; r++) {
  for (let c = 0; c < oc; c++) {
    let any = false
    for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
      const y = r + dy, x = c + dx
      if (y >= 0 && y < or && x >= 0 && x < oc && wet[y * oc + x]) { any = true; break }
    }
    if (any) { bits[(r * oc + c) >> 3] |= 1 << ((r * oc + c) & 7); nearWater++ }
  }
}
console.log(`baked ${oc}×${or} cells of ${CELL}" — ${land} land, ${bytes.length - land} open water, ${nearWater} beside water`)

const wrap = (u8) => Buffer.from(u8).toString('base64').replace(/(.{120})/g, '$1\n')
fs.writeFileSync(OUT, `// GENERATED by scripts/bake-shanghai-ground.mjs — do not edit.
//
// Bare-earth ground of urban Shanghai: DeltaDTM v1.1 (Pronk et al. 2024,
// CC BY 4.0; contains modified Copernicus DEM data), median of ${CELL}" blocks
// over ${SOUTH}–${NORTH} N, ${WEST}–${EAST} E (${oc} × ${or} cells; the box is
// SHANGHAI_GROUND_BOX in shanghai-ground.ts). Row 0 is the northern edge.
//
// HEIGHTS: one byte per cell, metres above EGM2008 = (byte − ${OFFSET}) / ${SCALE};
// ${NODATA} = open water. WATER: one bit per cell, set where the source has
// water in the cell or in one of the eight around it.

export const SHANGHAI_GROUND_COLS = ${oc}
export const SHANGHAI_GROUND_ROWS = ${or}
export const SHANGHAI_GROUND_OFFSET = ${OFFSET}
export const SHANGHAI_GROUND_SCALE = ${SCALE}
export const SHANGHAI_GROUND_NODATA = ${NODATA}

export const SHANGHAI_GROUND_HEIGHTS_B64 = \`
${wrap(bytes)}
\`

export const SHANGHAI_GROUND_WATER_B64 = \`
${wrap(bits)}
\`
`)
console.log('wrote', path.relative(ROOT, OUT), `(${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
