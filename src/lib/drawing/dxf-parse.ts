// ─── DXF reader ───────────────────────────────────────────────────────────────
// ASCII DXF (R12 to current), flattened to our entities: blocks are expanded,
// bulges and splines become points, BYLAYER/BYBLOCK colours are resolved.
//
// Written here rather than taken from npm because dxf-parser has had no release
// since 2021 and drops what real files use most (hatches, dimension blocks,
// frozen layers), and this has to report precisely what it skipped.

import { arcPoints, LAYER_PALETTE, type Layer, type NewEntity, type Pt } from './types'

export interface DxfResult {
  layers: Layer[]
  entities: NewEntity[]
  /** Metres per unit from $INSUNITS, when the file states it. */
  metresPerUnit: number | null
  skipped: Record<string, number>
  version: string | null
}

export class DxfError extends Error {
  constructor(public code: 'binary' | 'notDxf' | 'tooBig', message: string) { super(message) }
}

type Pair = [number, string]
interface Raw { type: string; pairs: Pair[] }

const MAX_ENTITIES = 3_000_000
const MAX_DEPTH = 16

/** AutoCAD Color Index → rgb. 1–9 are named; 10–249 follow the hue wheel; 250–255 are greys. */
export function aciToHex(aci: number): string {
  const named: Record<number, string> = {
    1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
  }
  if (named[aci]) return named[aci]
  if (aci >= 250 && aci <= 255) {
    const v = [51, 91, 132, 173, 214, 255][aci - 250]
    return hex(v, v, v)
  }
  if (aci < 10 || aci > 249) return '#ffffff'
  const hue = Math.floor((aci - 10) / 10) * 15
  const row = (aci - 10) % 10
  const value = [1, 1, 0.65, 0.65, 0.5, 0.5, 0.3, 0.3, 0.15, 0.15][row]
  const sat = row % 2 === 0 ? 1 : 0.5
  const c = value * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

const INSUNITS: Record<number, number> = {
  1: 0.0254, 2: 0.3048, 3: 1609.344, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 2.54e-8, 9: 2.54e-5, 10: 0.9144, 14: 0.1, 15: 10,
}

/** Decode the file: UTF-8 from AC1021 on, the declared code page before it. */
export function decodeDxf(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  if (head.startsWith('AutoCAD Binary DXF')) throw new DxfError('binary', 'Binary DXF')
  const version = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(head)?.[1]
  if (version && version >= 'AC1021') return new TextDecoder('utf-8').decode(bytes)
  const page = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(head)?.[1]?.toLowerCase() ?? ''
  const cp = /ansi_(\d+)/.exec(page)?.[1]
  const label = cp === '932' ? 'shift_jis' : cp === '936' ? 'gbk' : cp === '949' ? 'euc-kr' : cp === '950' ? 'big5' : cp ? `windows-${cp}` : 'windows-1252'
  try { return new TextDecoder(label).decode(bytes) } catch { return new TextDecoder('windows-1252').decode(bytes) }
}

/** MTEXT / TEXT codes to plain text. */
export function plainText(raw: string): string {
  return raw
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/\\[Pp]/g, '\n').replace(/\\~/g, ' ')
    .replace(/\\S([^;]*?)[#^/]([^;]*?);/g, '$1/$2')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/\\([\\{}])/g, '\u0000$1').replace(/[{}]/g, '').replace(/\u0000/g, '')
    .trim()
}

function readPairs(text: string): Pair[] {
  const out: Pair[] = []
  let pos = 0
  const n = text.length
  const nextLine = () => {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? n : nl
    const line = text.slice(pos, end)
    pos = end + 1
    return line.endsWith('\r') ? line.slice(0, -1) : line
  }
  while (pos < n) {
    const codeLine = nextLine()
    if (pos >= n && codeLine.trim() === '') break
    const code = Number(codeLine.trim())
    if (!Number.isInteger(code)) throw new DxfError('notDxf', 'Not a DXF group code')
    out.push([code, nextLine()])
  }
  return out
}

const num = (s: string | undefined, d = 0) => { const v = Number(s); return Number.isFinite(v) ? v : d }

function first(pairs: Pair[], code: number): string | undefined {
  for (const p of pairs) if (p[0] === code) return p[1]
  return undefined
}

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
const IDENT: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const mul = (m: Matrix, n: Matrix): Matrix => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
})
const apply = (m: Matrix, p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
const similar = (m: Matrix) => Math.abs(m.a * m.c + m.b * m.d) < 1e-9 && Math.abs(Math.hypot(m.a, m.b) - Math.hypot(m.c, m.d)) < 1e-9 && m.a * m.d - m.b * m.c > 0

/** Arbitrary Axis Algorithm: the object's extrusion (210/220/230) → world XY. Only the Z-flip case is planar here. */
const ocsFlip = (pairs: Pair[]) => num(first(pairs, 230), 1) < 0

function bulgePoints(a: Pt, b: Pt, bulge: number): Pt[] {
  if (Math.abs(bulge) < 1e-9) return []
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-12) return []
  const theta = 4 * Math.atan(bulge)
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2))
  const h = (chord / 2) * ((1 - bulge * bulge) / (2 * bulge))
  const c = { x: (a.x + b.x) / 2 - (dy / chord) * h, y: (a.y + b.y) / 2 + (dx / chord) * h }
  const sa = Math.atan2(a.y - c.y, a.x - c.x)
  const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(theta) / 0.15)))
  const out: Pt[] = []
  for (let i = 1; i < n; i++) {
    const t = sa + (theta * i) / n
    out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) })
  }
  return out
}

/** Vertex lists with bulges to plain points. */
export function expandBulges(verts: { p: Pt; bulge: number }[], closed: boolean): Pt[] {
  const out: Pt[] = []
  const n = verts.length
  for (let i = 0; i < n; i++) {
    out.push(verts[i].p)
    if (i < n - 1 || closed) out.push(...bulgePoints(verts[i].p, verts[(i + 1) % n].p, verts[i].bulge))
  }
  return out
}

function deBoor(ctrl: Pt[], knots: number[], degree: number, weights: number[] | null, steps: number): Pt[] {
  const n = ctrl.length
  if (n < degree + 1 || knots.length < n + degree + 1) return ctrl
  const lo = knots[degree]
  const hi = knots[n]
  const out: Pt[] = []
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(lo + ((hi - lo) * s) / steps, hi - 1e-12)
    let k = degree
    while (k < n - 1 && t >= knots[k + 1]) k++
    const dx: number[] = []
    const dy: number[] = []
    const dw: number[] = []
    for (let j = 0; j <= degree; j++) {
      const w = weights?.[k - degree + j] ?? 1
      dx[j] = ctrl[k - degree + j].x * w
      dy[j] = ctrl[k - degree + j].y * w
      dw[j] = w
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j
        const den = knots[i + degree - r + 1] - knots[i]
        const a = den === 0 ? 0 : (t - knots[i]) / den
        dx[j] = (1 - a) * dx[j - 1] + a * dx[j]
        dy[j] = (1 - a) * dy[j - 1] + a * dy[j]
        dw[j] = (1 - a) * dw[j - 1] + a * dw[j]
      }
    }
    out.push({ x: dx[degree] / dw[degree], y: dy[degree] / dw[degree] })
  }
  return out
}

function trueColor(v: string | undefined): string | null {
  if (v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? '#' + (n & 0xffffff).toString(16).padStart(6, '0') : null
}

export function parseDxf(input: string | Uint8Array): DxfResult {
  const text = typeof input === 'string' ? input : decodeDxf(input)
  const pairs = readPairs(text)
  if (!pairs.some(([c, v]) => c === 0 && v.trim() === 'SECTION')) throw new DxfError('notDxf', 'No DXF sections')

  // ── Sections
  const sections = new Map<string, Pair[]>()
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      const name = pairs[i + 1][1].trim()
      let j = i + 2
      while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1].trim() === 'ENDSEC')) j++
      sections.set(name, pairs.slice(i + 2, j))
      i = j
    }
  }

  // ── Header
  let metresPerUnit: number | null = null
  let version: string | null = null
  const header = sections.get('HEADER') ?? []
  for (let i = 0; i < header.length; i++) {
    if (header[i][0] !== 9) continue
    const key = header[i][1].trim()
    if (key === '$INSUNITS') metresPerUnit = INSUNITS[num(header[i + 1]?.[1])] ?? null
    if (key === '$ACADVER') version = header[i + 1]?.[1].trim() ?? null
  }

  const split = (ps: Pair[]): Raw[] => {
    const out: Raw[] = []
    let cur: Raw | null = null
    for (const p of ps) {
      if (p[0] === 0) { cur = { type: p[1].trim(), pairs: [] }; out.push(cur) } else cur?.pairs.push(p)
    }
    return out
  }

  // ── Layers
  const layers = new Map<string, Layer>()
  const tables = split(sections.get('TABLES') ?? [])
  for (const t of tables) {
    if (t.type !== 'LAYER') continue
    const name = first(t.pairs, 2)?.trim()
    if (!name) continue
    const aci = num(first(t.pairs, 62), 7)
    const flags = num(first(t.pairs, 70))
    const color = trueColor(first(t.pairs, 420)) ?? aciToHex(Math.abs(aci))
    const off = aci < 0 || (flags & 1) !== 0
    layers.set(name, { name, color, visible: !off, locked: (flags & 4) !== 0 })
  }
  const ensureLayer = (name: string): string => {
    if (!layers.has(name)) layers.set(name, { name, color: name === '0' ? '#ffffff' : LAYER_PALETTE[layers.size % LAYER_PALETTE.length], visible: true, locked: false })
    return name
  }

  // ── Blocks
  const blocks = new Map<string, { base: Pt; items: Raw[] }>()
  {
    let cur: { name: string; base: Pt; items: Raw[] } | null = null
    for (const r of split(sections.get('BLOCKS') ?? [])) {
      if (r.type === 'BLOCK') cur = { name: first(r.pairs, 2)?.trim() ?? '', base: { x: num(first(r.pairs, 10)), y: num(first(r.pairs, 20)) }, items: [] }
      else if (r.type === 'ENDBLK') { if (cur?.name) blocks.set(cur.name, cur); cur = null } else cur?.items.push(r)
    }
  }

  // ── Entities
  const out: NewEntity[] = []
  const skipped: Record<string, number> = {}
  const skip = (t: string) => { skipped[t] = (skipped[t] ?? 0) + 1 }

  const walk = (items: Raw[], m: Matrix, parentLayer: string | null, parentColor: string | null, depth: number, stack: Set<string>) => {
    for (let idx = 0; idx < items.length; idx++) {
      if (out.length > MAX_ENTITIES) throw new DxfError('tooBig', 'Too many entities')
      const r = items[idx]
      const ps = r.pairs
      const rawLayer = first(ps, 8)?.trim() ?? '0'
      const layer = rawLayer === '0' && parentLayer ? parentLayer : rawLayer
      if (first(ps, 60) === '1') continue
      const aci = first(ps, 62)
      const tc = trueColor(first(ps, 420))
      const color = tc ?? (aci === undefined || aci === '256' || aci.trim() === '256' ? null
        : num(aci) === 0 ? parentColor : aciToHex(Math.abs(num(aci))))
      const finalColor = color ?? (aci === undefined || num(aci) === 256 ? null : parentColor)
      const base = { layer: ensureLayer(layer), color: finalColor }
      const flip = ocsFlip(ps)
      const ocs = (x: number, y: number): Pt => apply(m, { x: flip ? -x : x, y })

      switch (r.type) {
        case 'LINE':
          out.push({ ...base, kind: 'line', a: apply(m, { x: num(first(ps, 10)), y: num(first(ps, 20)) }), b: apply(m, { x: num(first(ps, 11)), y: num(first(ps, 21)) }) })
          break
        case 'POINT':
          out.push({ ...base, kind: 'point', at: ocs(num(first(ps, 10)), num(first(ps, 20))) })
          break
        case 'CIRCLE': case 'ARC': {
          const cx = num(first(ps, 10)); const cy = num(first(ps, 20)); const radius = num(first(ps, 40))
          if (!(radius > 0)) break
          const deg = Math.PI / 180
          let s = r.type === 'ARC' ? num(first(ps, 50)) * deg : 0
          let e = r.type === 'ARC' ? num(first(ps, 51)) * deg : Math.PI * 2
          if (flip && r.type === 'ARC') { const ns = Math.PI - e; e = Math.PI - s; s = ns }
          if (similar(m)) {
            const c = ocs(cx, cy)
            const sc = Math.hypot(m.a, m.b)
            const rot = Math.atan2(m.b, m.a)
            if (r.type === 'CIRCLE') out.push({ ...base, kind: 'circle', c, r: radius * sc })
            else out.push({ ...base, kind: 'arc', c, r: radius * sc, start: s + rot, end: e + rot })
          } else {
            const pts = arcPoints({ x: flip ? -cx : cx, y: cy }, radius, s, e).map((p) => apply(m, p))
            out.push({ ...base, kind: 'polyline', points: pts, closed: r.type === 'CIRCLE' })
          }
          break
        }
        case 'ELLIPSE': {
          const cx = num(first(ps, 10)); const cy = num(first(ps, 20))
          const mx = num(first(ps, 11)); const my = num(first(ps, 21))
          const ratio = num(first(ps, 40), 1)
          const s = num(first(ps, 41)); let e = num(first(ps, 42), Math.PI * 2)
          if (e <= s) e += Math.PI * 2
          const n = Math.max(12, Math.ceil(((e - s) / (Math.PI * 2)) * 96))
          const pts: Pt[] = []
          for (let i = 0; i <= n; i++) {
            const t = s + ((e - s) * i) / n
            const u = Math.cos(t); const v = Math.sin(t) * ratio
            pts.push(ocs(cx + mx * u - my * v, cy + my * u + mx * v))
          }
          out.push({ ...base, kind: 'polyline', points: pts, closed: false })
          break
        }
        case 'LWPOLYLINE': {
          const closed = (num(first(ps, 70)) & 1) === 1
          const verts: { p: Pt; bulge: number }[] = []
          let cur: { x: number; y: number; bulge: number } | null = null
          for (const [c, v] of ps) {
            if (c === 10) { if (cur) verts.push({ p: { x: cur.x, y: cur.y }, bulge: cur.bulge }); cur = { x: num(v), y: 0, bulge: 0 } } else if (c === 20 && cur) cur.y = num(v)
            else if (c === 42 && cur) cur.bulge = num(v)
          }
          if (cur) verts.push({ p: { x: cur.x, y: cur.y }, bulge: cur.bulge })
          if (verts.length >= 2) out.push({ ...base, kind: 'polyline', points: expandBulges(verts, closed).map((p) => ocs(p.x, p.y)), closed })
          break
        }
        case 'POLYLINE': {
          const flags = num(first(ps, 70))
          const closed = (flags & 1) === 1
          const verts: { p: Pt; bulge: number }[] = []
          while (idx + 1 < items.length && items[idx + 1].type === 'VERTEX') {
            idx++
            const vp = items[idx].pairs
            if (num(first(vp, 70)) & 16) continue // spline frame control point
            verts.push({ p: { x: num(first(vp, 10)), y: num(first(vp, 20)) }, bulge: num(first(vp, 42)) })
          }
          if (items[idx + 1]?.type === 'SEQEND') idx++
          if (flags & 80) { skip(flags & 16 ? 'POLYGON MESH' : 'POLYFACE MESH'); break }
          if (verts.length >= 2) out.push({ ...base, kind: 'polyline', points: expandBulges(verts, closed).map((p) => ocs(p.x, p.y)), closed })
          break
        }
        case 'SPLINE': {
          const degree = num(first(ps, 71), 3)
          const knots = ps.filter((p) => p[0] === 40).map((p) => num(p[1]))
          const wts = ps.filter((p) => p[0] === 41).map((p) => num(p[1]))
          const xs = ps.filter((p) => p[0] === 10).map((p) => num(p[1]))
          const ys = ps.filter((p) => p[0] === 20).map((p) => num(p[1]))
          const ctrl = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }))
          const fx = ps.filter((p) => p[0] === 11).map((p) => num(p[1]))
          const fy = ps.filter((p) => p[0] === 21).map((p) => num(p[1]))
          const pts = ctrl.length >= 2
            ? deBoor(ctrl, knots, degree, wts.length === ctrl.length ? wts : null, Math.max(16, ctrl.length * 6))
            : fx.map((x, i) => ({ x, y: fy[i] ?? 0 }))
          if (pts.length >= 2) out.push({ ...base, kind: 'polyline', points: pts.map((p) => apply(m, p)), closed: (num(first(ps, 70)) & 1) === 1 })
          else skip('SPLINE')
          break
        }
        case 'SOLID': case 'TRACE': case '3DFACE': {
          const p1 = ocs(num(first(ps, 10)), num(first(ps, 20)))
          const p2 = ocs(num(first(ps, 11)), num(first(ps, 21)))
          const p3 = ocs(num(first(ps, 12)), num(first(ps, 22)))
          const p4 = ocs(num(first(ps, 13), num(first(ps, 12))), num(first(ps, 23), num(first(ps, 22))))
          // SOLID's corners run in a Z; 3DFACE's run around.
          const points = r.type === '3DFACE' ? [p1, p2, p3, p4] : [p1, p2, p4, p3]
          if (r.type === '3DFACE') out.push({ ...base, kind: 'polyline', points, closed: true })
          else out.push({ ...base, kind: 'fill', points })
          break
        }
        case 'TEXT': case 'ATTRIB': case 'MTEXT': {
          if (r.type === 'ATTRIB' && (num(first(ps, 70)) & 1)) break
          const raw = r.type === 'MTEXT'
            ? ps.filter((p) => p[0] === 3).map((p) => p[1]).join('') + (first(ps, 1) ?? '')
            : first(ps, 1) ?? ''
          const str = plainText(raw)
          if (!str) break
          const just = num(first(ps, 72))
          const mtextAttach = num(first(ps, 71), 1)
          const useAlign = r.type !== 'MTEXT' && (just !== 0 || num(first(ps, 73)) !== 0) && first(ps, 11) !== undefined
          const at = ocs(num(first(ps, useAlign ? 11 : 10)), num(first(ps, useAlign ? 21 : 20)))
          let rotation = num(first(ps, 50)) * (Math.PI / 180)
          const dirX = first(ps, 11)
          if (r.type === 'MTEXT' && dirX !== undefined) rotation = Math.atan2(num(first(ps, 21)), num(dirX))
          const hs = Math.hypot(m.c, m.d)
          const lines = str.split('\n')
          const h = num(first(ps, 40), 1) * hs
          const align = r.type === 'MTEXT'
            ? ((mtextAttach - 1) % 3 === 1 ? 'center' : (mtextAttach - 1) % 3 === 2 ? 'right' : 'left')
            : just === 1 || just === 4 ? 'center' : just === 2 ? 'right' : 'left'
          const totalRot = rotation + Math.atan2(m.b, m.a)
          // MTEXT anchors at its top by default: baseline of the first line is one height below.
          const row = r.type === 'MTEXT' && mtextAttach <= 3 ? 1 : 0
          lines.forEach((line, i) => {
            if (!line.trim()) return
            const off = (i + row) * h * (i === 0 ? 1 : 1.4)
            out.push({ ...base, kind: 'text', at: { x: at.x + Math.sin(totalRot) * off, y: at.y - Math.cos(totalRot) * off }, height: h, rotation: totalRot, text: line, align })
          })
          break
        }
        case 'INSERT': case 'DIMENSION': {
          const name = first(ps, 2)?.trim()
          const blk = name ? blocks.get(name) : undefined
          const attached: Raw[] = []
          if (r.type === 'INSERT' && first(ps, 66) === '1') {
            while (idx + 1 < items.length && items[idx + 1].type !== 'SEQEND') { idx++; attached.push(items[idx]) }
            idx++
          }
          if (!blk) { if (r.type === 'DIMENSION') skip('DIMENSION'); else if (name) skip('INSERT'); }
          if (blk && depth < MAX_DEPTH && !stack.has(name!)) {
            const ip = { x: num(first(ps, 10)), y: num(first(ps, 20)) }
            if (r.type === 'DIMENSION') {
              stack.add(name!)
              walk(blk.items, m, layer, finalColor, depth + 1, stack)
              stack.delete(name!)
              break
            }
            const sx = num(first(ps, 41), 1); const sy = num(first(ps, 42), 1)
            const rot = num(first(ps, 50)) * (Math.PI / 180)
            const cols = Math.max(1, num(first(ps, 70), 1)); const rows = Math.max(1, num(first(ps, 71), 1))
            const dc = num(first(ps, 44)); const dr = num(first(ps, 45))
            const cos = Math.cos(rot); const sin = Math.sin(rot)
            stack.add(name!)
            for (let c = 0; c < cols; c++) {
              for (let rw = 0; rw < rows; rw++) {
                const ax = ip.x + cos * c * dc - sin * rw * dr
                const ay = ip.y + sin * c * dc + cos * rw * dr
                const local: Matrix = mul(
                  { a: cos, b: sin, c: -sin, d: cos, e: ax, f: ay },
                  { a: sx, b: 0, c: 0, d: sy, e: -blk.base.x * sx, f: -blk.base.y * sy },
                )
                walk(blk.items, mul(m, local), layer, finalColor, depth + 1, stack)
              }
            }
            stack.delete(name!)
          }
          if (attached.length) walk(attached, m, layer, finalColor, depth + 1, stack)
          break
        }
        case 'HATCH': readHatch(ps, base, m, flip, out, skip); break
        case 'LEADER': {
          const xs = ps.filter((p) => p[0] === 10).map((p) => num(p[1]))
          const ys = ps.filter((p) => p[0] === 20).map((p) => num(p[1]))
          if (xs.length >= 2) out.push({ ...base, kind: 'polyline', points: xs.map((x, i) => ocs(x, ys[i] ?? 0)), closed: false })
          break
        }
        case 'SEQEND': case 'VIEWPORT': case 'ATTDEF': break
        default: skip(r.type)
      }
    }
  }

  const all = split(sections.get('ENTITIES') ?? [])
  // Model space (67 absent or 0). A file whose content lives only in a layout still shows.
  const modelSpace = all.filter((r) => first(r.pairs, 67) !== '1')
  const hasDrawing = modelSpace.some((r) => r.type !== 'VIEWPORT')
  walk(hasDrawing ? modelSpace : all, IDENT, null, null, 0, new Set())

  // Frozen and off layers arrive switched off with their content, so switching them on shows it.
  return { layers: [...layers.values()], entities: out, metresPerUnit, skipped, version }
}

/** HATCH boundaries: solid → fill, pattern → outline (the pattern lines themselves are not expanded). */
function readHatch(
  ps: Pair[], base: { layer: string; color: string | null }, m: Matrix, flip: boolean,
  out: NewEntity[], skip: (t: string) => void,
) {
  const solid = first(ps, 70) === '1'
  const start = ps.findIndex((p) => p[0] === 91)
  if (start < 0) { skip('HATCH'); return }
  const nLoops = num(ps[start][1])
  let i = start + 1
  const tx = (p: Pt) => apply(m, { x: flip ? -p.x : p.x, y: p.y })
  for (let l = 0; l < nLoops && i < ps.length; l++) {
    while (i < ps.length && ps[i][0] !== 92) i++
    if (i >= ps.length) break
    const type = num(ps[i][1]); i++
    const pts: Pt[] = []
    if (type & 2) {
      // polyline loop: 72 has-bulge, 73 closed, 93 count, then 10/20/42
      let hasBulge = 0; let count = 0
      while (i < ps.length && ps[i][0] !== 10) {
        if (ps[i][0] === 72) hasBulge = num(ps[i][1])
        if (ps[i][0] === 93) count = num(ps[i][1])
        i++
      }
      const verts: { p: Pt; bulge: number }[] = []
      for (let v = 0; v < count && i < ps.length && ps[i][0] === 10; v++) {
        const x = num(ps[i][1]); const y = num(ps[i + 1]?.[1]); i += 2
        let bulge = 0
        if (hasBulge && ps[i]?.[0] === 42) { bulge = num(ps[i][1]); i++ }
        verts.push({ p: { x, y }, bulge })
      }
      pts.push(...expandBulges(verts, true))
    } else {
      while (i < ps.length && ps[i][0] !== 93) i++
      const edges = num(ps[i]?.[1]); i++
      for (let e = 0; e < edges && i < ps.length; e++) {
        while (i < ps.length && ps[i][0] !== 72) i++
        const et = num(ps[i]?.[1]); i++
        const read = (...codes: number[]) => codes.map((code) => {
          while (i < ps.length && ps[i][0] !== code) i++
          const v = num(ps[i]?.[1]); i++
          return v
        })
        if (et === 1) {
          const [x1, y1, x2, y2] = read(10, 20, 11, 21)
          pts.push({ x: x1, y: y1 }, { x: x2, y: y2 })
        } else if (et === 2) {
          const [cx, cy, rr, sa, ea, ccw] = read(10, 20, 40, 50, 51, 73)
          const deg = Math.PI / 180
          const arc = ccw ? arcPoints({ x: cx, y: cy }, rr, sa * deg, ea * deg) : arcPoints({ x: cx, y: cy }, rr, -ea * deg, -sa * deg).reverse()
          pts.push(...arc)
        } else {
          // Ellipse and spline edges: the hatch still closes across them, so it is counted.
          skip('HATCH edge')
        }
      }
    }
    while (i < ps.length && ps[i][0] !== 97) i++
    i++
    if (pts.length >= 3) {
      const points = pts.map(tx)
      if (solid) out.push({ ...base, kind: 'fill', points })
      else out.push({ ...base, kind: 'polyline', points, closed: true })
    }
  }
}

/** DWG header version, for a message that names what the user holds. */
export function dwgVersion(bytes: Uint8Array): string | null {
  const magic = new TextDecoder('latin1').decode(bytes.subarray(0, 6))
  const names: Record<string, string> = {
    AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004',
    AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018',
  }
  return /^AC\d{4}$/.test(magic) ? (names[magic] ?? magic) : null
}
