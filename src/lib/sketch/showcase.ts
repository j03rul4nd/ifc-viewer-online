// ─── Showcase drawings ────────────────────────────────────────────────────────
// The drawings in the articles and their live demos: ordinary documents, made of
// the strokes the studio itself stores, so what a reader orbits is what the engine
// really draws. They are plotted by this code, with a hand's wobble and pressure,
// not drawn by a person, and the articles say so. Seeded: the same picture each run.

import { createDoc, createLayer } from './document'
import type { LayerFilters } from './filters'
import type { BrushKind, LayerBlend, OrbitState, PaperKind, SketchDoc, SketchLayer, Stroke, Vec3 } from './types'

export type ShowcaseId = 'pavilion' | 'tower' | 'bridge' | 'city' | 'markup'

export interface Showcase {
  doc: SketchDoc
  orbit: OrbitState
  /** Where the reader's own strokes land. */
  drawAt: Vec3
}

const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

interface Pen { color: string; width: number; brush?: BrushKind; opacity?: number; wobble?: number; over?: number; pressure?: number }

/** A layer being plotted: every line goes through the same hand. */
class Sheet {
  readonly strokes: Stroke[] = []
  private n = 0
  constructor(private readonly rand: () => number, private readonly name: string, readonly filters?: LayerFilters, readonly blend?: LayerBlend, readonly opacity?: number) {}

  /** A path with slow wander, slight overshoot and pressure that swells mid-line. */
  line(path: readonly Vec3[], pen: Pen): void {
    if (path.length < 2) return
    const { rand } = this
    const wobble = pen.wobble ?? 0.012
    const over = pen.over ?? 0
    const first = path[0], second = path[1], last = path[path.length - 1], before = path[path.length - 2]
    const extend = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (a[0] - b[0]) * k, a[1] + (a[1] - b[1]) * k, a[2] + (a[2] - b[2]) * k]
    const full = over > 0 ? [extend(first, second, over * rand()), ...path, extend(last, before, over * rand())] : [...path]
    const samples: Vec3[] = []
    for (let i = 0; i < full.length - 1; i++) {
      const a = full[i], b = full[i + 1]
      const steps = Math.max(1, Math.min(14, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.25)))
      for (let s = 0; s < steps; s++) samples.push([a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps, a[2] + (b[2] - a[2]) * s / steps])
    }
    samples.push(full[full.length - 1])
    const phase = [rand() * 6.3, rand() * 6.3, rand() * 6.3]
    const rate = 2 + rand() * 3
    const base = pen.pressure ?? 0.8
    const points = new Float32Array(samples.length * 4)
    samples.forEach((p, i) => {
      const t = i / (samples.length - 1)
      points[i * 4] = p[0] + Math.sin(t * rate + phase[0]) * wobble
      points[i * 4 + 1] = p[1] + Math.sin(t * rate * 1.3 + phase[1]) * wobble
      points[i * 4 + 2] = p[2] + Math.sin(t * rate * 0.8 + phase[2]) * wobble
      points[i * 4 + 3] = base * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.45))
    })
    this.strokes.push({ id: `${this.name}-${this.n++}`, brush: pen.brush ?? 'pen', color: pen.color, width: pen.width, opacity: pen.opacity, points })
  }

  layer(): SketchLayer {
    return { ...createLayer(this.name), id: `layer-${this.name}`, strokes: this.strokes, filters: this.filters, blend: this.blend, opacity: this.opacity }
  }
}

const circleOnGround = (c: Vec3, r: number, n = 28, wave = 0, seed = 0): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const q = r * (1 + wave * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2) * 0.4))
    return [c[0] + Math.cos(a) * q, c[1], c[2] + Math.sin(a) * q]
  })

function assemble(layers: Sheet[], paper: PaperKind, color: string | undefined, orbit: OrbitState, drawAt: Vec3): Showcase {
  const doc = createDoc()
  const page = doc.pages[0]
  const built = layers.map((l) => l.layer())
  return {
    doc: {
      ...doc, paper, background: { color, pattern: 'plain' },
      pages: [{ ...page, layers: built, activeLayerId: built[built.length - 1].id }],
    },
    orbit, drawAt,
  }
}

/** A ring standing upright, facing the viewer's side of the scene. */
const ringUpright = (c: Vec3, r: number, n = 24, wave = 0, seed = 0): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const q = r * (1 + wave * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 7 + seed * 2) * 0.4))
    return [c[0] + Math.cos(a) * q, c[1] + Math.sin(a) * q, c[2]]
  })

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** A ruled shell over warm paper, in pencil and terracotta marker. */
function pavilion(): Showcase {
  const rand = random(11)
  const site = new Sheet(rand, 'construction', undefined, undefined, 0.75)
  const tone = new Sheet(rand, 'tone', undefined, 'multiply')
  const ink = new Sheet(rand, 'ink')
  const graphite = '#3a342c', blue = '#3f79b5', clay = '#d9774a'

  // Three saddle roofs, each corner up or down: straight lines make the curve.
  const shells: [Vec3, Vec3, Vec3, Vec3][] = [
    [[-6.5, 4.6, -2.6], [-1.6, 1.9, -3.4], [-1.2, 5.4, 1.8], [-6.9, 2.1, 2.5]],
    [[-1.6, 1.9, -3.4], [3.2, 5.9, -3], [3.6, 2.2, 1.4], [-1.2, 5.4, 1.8]],
    [[3.2, 5.9, -3], [7.2, 2.3, -1.8], [7.4, 4.8, 2.4], [3.6, 2.2, 1.4]],
  ]
  for (const [a, b, c, d] of shells) {
    const n = 26
    for (let i = 0; i <= n; i++) {
      const t = i / n
      ink.line([mix(a, b, t), mix(d, c, t)], { color: graphite, width: i % 13 === 0 ? 2.2 : 0.9, brush: 'pencil', wobble: 0.01 })
      ink.line([mix(a, d, t), mix(b, c, t)], { color: graphite, width: 0.8, brush: 'pencil', opacity: 0.7, wobble: 0.01 })
      if (i % 2 === 0) tone.line([mix(a, b, t), mix(d, c, t)], { color: clay, width: 9, brush: 'marker', opacity: 0.17, wobble: 0.02 })
    }
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]] as [Vec3, Vec3][]) ink.line([p, q], { color: '#1e1a15', width: 3, over: 0.05 })
    for (const p of [a, b, c, d]) {
      ink.line([p, [p[0], 0, p[2]]], { color: '#1e1a15', width: 2.6, over: 0.02 })
      site.line([[p[0], 0, p[2]], [p[0], 8, p[2]]], { color: blue, width: 0.7, brush: 'pencil', opacity: 0.45 })
      ink.line(circleOnGround([p[0], 0, p[2]], 0.16, 10), { color: '#1e1a15', width: 1.5 })
    }
  }
  // Setting out, shadow and people for scale.
  for (let i = -5; i <= 5; i++) {
    site.line([[i * 1.9, 0, -8], [i * 1.9, 0, 7]], { color: blue, width: 0.7, brush: 'pencil', opacity: 0.55, over: 0.06 })
    site.line([[-11, 0, i * 1.5], [11, 0, i * 1.5]], { color: blue, width: 0.7, brush: 'pencil', opacity: 0.55, over: 0.06 })
  }
  for (let i = 0; i < 90; i++) {
    const x = -7.4 + i * 0.17
    tone.line([[x, 0, -3.3 + Math.sin(i * 0.2) * 0.3], [x + 1.5, 0, 2.5 + Math.sin(i * 0.17) * 0.4]], { color: '#8b7c6a', width: 4, brush: 'marker', opacity: 0.2 })
  }
  for (let i = 0; i < 8; i++) {
    const x = -7 + rand() * 13, z = 1 + rand() * 3
    ink.line([[x, 0, z], [x, 1.16, z]], { color: '#1e1a15', width: 3, wobble: 0.004 })
    ink.line(ringUpright([x, 1.34, z], 0.12, 12), { color: '#1e1a15', width: 2.4, wobble: 0 })
  }
  for (let i = 0; i < 6; i++) {
    const c: Vec3 = [-11 + i * 4.4 + rand(), 0, -7 - rand() * 2]
    ink.line([c, [c[0], 2, c[2]]], { color: '#4a5a3a', width: 2.2 })
    for (let k = 0; k < 5; k++) ink.line(ringUpright([c[0] + (rand() - 0.5) * 0.8, 2.6 + k * 0.28, c[2]], 1.35 - k * 0.2, 30, 0.07, k + i), { color: '#5d7147', width: 1, brush: 'pencil', wobble: 0.01 })
  }
  return assemble([site, tone, ink], 'warm', undefined, { target: [0, 2.6, -0.4], azimuth: 0.5, elevation: 0.23, distance: 19, mode: 'perspective' }, [0, 2.5, 3])
}

/** A twisting tower in light on black: floors, diagrid, and the sun's path. */
function tower(): Showcase {
  const rand = random(23)
  const ground = new Sheet(rand, 'site', undefined, undefined, 0.8)
  const floors = new Sheet(rand, 'floors', { glow: 1 })
  const grid = new Sheet(rand, 'diagrid', { saturation: 1.3, glow: 3 })
  const accent = new Sheet(rand, 'sun', { glow: 5 })
  const H = 19, N = 62
  const section = (y: number, s: number): Vec3 => {
    const t = y / H
    const r = 3 * (1 - 0.42 * t) * (1 + 0.1 * Math.sin(t * Math.PI))
    const a = s * Math.PI * 2 + t * 2.1
    // A rounded square, from superellipse radii.
    const c = Math.cos(a - t * 2.1), d = Math.sin(a - t * 2.1)
    const q = r / Math.pow(Math.pow(Math.abs(c), 3.4) + Math.pow(Math.abs(d), 3.4), 1 / 3.4)
    return [Math.cos(a) * q, y, Math.sin(a) * q]
  }
  for (let f = 0; f <= N; f++) {
    const y = (f / N) * H
    const ring = Array.from({ length: 49 }, (_, i) => section(y, i / 48))
    floors.line(ring, { color: f % 8 === 0 ? '#f4fbff' : '#4f9fd6', width: f % 8 === 0 ? 2 : 0.9, wobble: 0.006, opacity: f % 8 === 0 ? 1 : 0.8 })
  }
  for (let k = 0; k < 16; k++) {
    for (const dir of [1, -1]) {
      const path = Array.from({ length: 49 }, (_, i) => section((i / 48) * H, k / 16 + (dir * i) / 48 * 0.42))
      grid.line(path, { color: dir > 0 ? '#27e4ff' : '#7a7dff', width: 1.1, wobble: 0.006 })
    }
  }
  for (let m = 0; m < 4; m++) {
    grid.line(Array.from({ length: 49 }, (_, i) => section((i / 48) * H, m / 4 + 0.125)), { color: '#ffffff', width: 2.8, wobble: 0.005 })
  }
  // Ripples of the plot.
  for (let r = 0; r < 15; r++) ground.line(circleOnGround([0, 0, 0], 3.6 + r * r * 0.1 + r * 0.5, 64, 0.04 + r * 0.004, r), { color: '#2a6b9c', width: r % 4 === 0 ? 1.4 : 0.8, opacity: 1 - r / 19 })
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    ground.line([[Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2], [Math.cos(a) * 15, 0, Math.sin(a) * 15]], { color: '#1e4c70', width: 0.7 })
  }
  // The sun's arc, its rays down to the crown, and the long shadow.
  const arc = Array.from({ length: 49 }, (_, i): Vec3 => {
    const t = i / 48, a = Math.PI * t
    return [Math.cos(a) * 15, Math.sin(a) * 19, -6 + Math.sin(a) * 2]
  })
  accent.line(arc, { color: '#ff9d3c', width: 2.2, wobble: 0.01 })
  for (let i = 4; i <= 44; i += 4) {
    accent.line(ringUpright(arc[i], 0.22 + (i === 16 ? 0.4 : 0), 24), { color: '#ffd36b', width: i === 16 ? 3 : 1.5, wobble: 0 })
    if (i === 16) for (let k = 0; k < 11; k++) accent.line([arc[i], section(H - k * 1.9, k / 11)], { color: '#ff8a3c', width: 0.7, opacity: 0.3 })
  }
  // The shadow falls away from the sun marked above.
  for (let i = 0; i < 44; i++) {
    const a = Math.PI + (i / 43 - 0.5) * 0.5
    accent.line([[Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6 - 1], [Math.cos(a) * (12 + rand() * 1.5), 0, Math.sin(a) * (12 + rand() * 1.5) - 1]], { color: '#ff7a33', width: 0.5, opacity: 0.13 })
  }
  return assemble([ground, floors, grid, accent], 'night', '#05070d', { target: [0, 8.6, 0], azimuth: 0.42, elevation: 0.17, distance: 37, mode: 'perspective' }, [0, 9, 0])
}

/** A cable-stayed crossing, as a blueprint, with a monitoring layer in amber. */
function bridge(): Showcase {
  const rand = random(37)
  const land = new Sheet(rand, 'terrain', undefined, undefined, 0.8)
  const steel = new Sheet(rand, 'structure', { glow: 3 })
  const stays = new Sheet(rand, 'stays', { glow: 2 })
  const sensors = new Sheet(rand, 'monitoring', { glow: 12 })
  const white = '#e6f2ff', pale = '#8fc1f2', deepBlue = '#3f7fc4', amber = '#ffc23c'
  const deckY = (x: number) => 3.6 - 0.012 * x * x
  const span = 19, width = 1.3
  const deck = (x: number, z: number): Vec3 => [x, deckY(x), z]
  const along = (z: number, y = 0): Vec3[] => Array.from({ length: 77 }, (_, i) => { const x = -span + (i / 76) * span * 2; return [x, deckY(x) + y, z] })
  for (const z of [-width, width]) {
    steel.line(along(z), { color: white, width: 2.6, wobble: 0.004 })
    steel.line(along(z, -0.42), { color: pale, width: 1.3, wobble: 0.004 })
    steel.line(along(z, 0.32), { color: pale, width: 0.8, wobble: 0.003 })
  }
  for (let i = 0; i <= 76; i++) {
    const x = -span + (i / 76) * span * 2
    steel.line([deck(x, -width), deck(x, width)], { color: pale, width: 0.7, wobble: 0 })
    if (i % 2) for (const z of [-width, width]) steel.line([deck(x, z), [x + 0.25, deckY(x) - 0.42, z]], { color: deepBlue, width: 0.7, wobble: 0 })
  }
  // Two A-frame pylons, and the fans of stays from each.
  for (const px of [-8, 8]) {
    const top: Vec3 = [px, 15.5, 0]
    for (const z of [-1, 1]) {
      const foot: Vec3 = [px, 0, z * 2.6]
      for (const off of [-0.16, 0.16]) steel.line([[foot[0] + off, 0, foot[2]], [top[0] + off, top[1], 0]], { color: white, width: 2.4, wobble: 0.004, over: 0.01 })
      for (let k = 1; k < 16; k++) {
        const a = mix(foot, top, k / 16)
        steel.line([[a[0] - 0.16, a[1], a[2]], [a[0] + 0.16, a[1], a[2]]], { color: pale, width: 0.8, wobble: 0 })
      }
      for (let s = 0; s < 15; s++) {
        const anchor = mix(foot, top, 0.72 + s * 0.0185)
        for (const side of [-1, 1]) {
          const reach = 1.2 + (s + 1) * 0.62
          stays.line([anchor, deck(px + side * reach, z * width)], { color: s % 5 === 4 ? '#ffffff' : pale, width: s % 5 === 4 ? 1.2 : 0.7, wobble: 0.002 })
        }
      }
    }
    steel.line([[px, deckY(px) - 0.5, -2], [px, deckY(px) - 0.5, 2]], { color: white, width: 2.2 })
    land.line(circleOnGround([px, 0, 0], 3.5, 32, 0.03, px), { color: pale, width: 1.3 })
    land.line(circleOnGround([px, 0, 0], 4.1, 32, 0.05, px + 1), { color: deepBlue, width: 0.9 })
  }
  // Water and both banks.
  for (let i = 0; i < 300; i++) {
    const x = -13 + rand() * 26, z = -14 + rand() * 28, l = 0.3 + rand() * 1.3
    land.line([[x, 0, z], [x + l, 0, z + rand() * 0.04]], { color: deepBlue, width: 0.7, opacity: 0.3 + rand() * 0.55, wobble: 0.01 })
  }
  for (const side of [-1, 1]) {
    for (let c = 0; c < 8; c++) {
      const y = c * 0.48
      const edge = Array.from({ length: 41 }, (_, i): Vec3 => {
        const z = -18 + i * 0.9
        return [side * (13.5 + c * 1 + Math.sin(z * 0.34 + c + side) * 0.7), y, z]
      })
      land.line(edge, { color: c % 3 === 0 ? pale : deepBlue, width: c % 3 === 0 ? 1.3 : 0.8 })
    }
  }
  // Monitoring: strain gauges along the deck and their readings rising in arcs.
  const nodes: Vec3[] = []
  for (const px of [-8, 8]) nodes.push([px, 15.7, 0])
  for (let x = -16; x <= 16; x += 4) nodes.push(deck(x, width))
  for (const n of nodes) {
    sensors.line(Array.from({ length: 15 }, (_, i): Vec3 => { const a = (i / 14) * Math.PI * 2; return [n[0] + Math.cos(a) * 0.28, n[1] + Math.sin(a) * 0.28, n[2]] }), { color: amber, width: 1.9, wobble: 0 })
    sensors.line(Array.from({ length: 15 }, (_, i): Vec3 => { const a = (i / 14) * Math.PI * 2; return [n[0] + Math.cos(a) * 0.09, n[1] + Math.sin(a) * 0.09, n[2]] }), { color: '#fff4c4', width: 2.5, wobble: 0 })
  }
  // A strain curve drawn above the deck, tied back to its gauges.
  const reading = (x: number) => 7.7 + 1.6 * Math.exp(-Math.pow((x - 8) / 5, 2)) + 1.15 * Math.exp(-Math.pow((x + 8) / 5, 2)) + Math.sin(x * 1.5) * 0.08
  sensors.line(Array.from({ length: 65 }, (_, i): Vec3 => { const x = -span + (i / 64) * span * 2; return [x, deckY(x) + reading(x), 3.6] }), { color: amber, width: 2.1, wobble: 0.004 })
  for (let x = -16; x <= 16; x += 4) sensors.line([deck(x, width), [x, deckY(x) + reading(x), 3.6]], { color: amber, width: 0.7, opacity: 0.45, wobble: 0 })
  return assemble([land, steel, stays, sensors], 'night', '#082a5e', { target: [0, 6.6, 0], azimuth: 0.5, elevation: 0.15, distance: 39, mode: 'perspective' }, [0, 6, 3.6])
}

/** A city block as a digital twin idea: wireframes, data arcs, the flood's edge. */
function city(): Showcase {
  const rand = random(53)
  const streets = new Sheet(rand, 'streets', undefined, undefined, 0.85)
  const blocks = new Sheet(rand, 'buildings', { glow: 2 })
  const water = new Sheet(rand, 'flood', { glow: 5 })
  const arcs = new Sheet(rand, 'data', { saturation: 1.3, glow: 5 })
  const G = 8, cell = 2.5
  const hubs: Vec3[] = []
  const outline = (x: number, z: number, w: number, d: number, y: number): Vec3[] => [[x - w, y, z - d], [x + w, y, z - d], [x + w, y, z + d], [x - w, y, z + d], [x - w, y, z - d]]
  for (let i = -G; i <= G; i++) {
    streets.line([[i * cell - cell / 2, 0, -G * cell - cell], [i * cell - cell / 2, 0, G * cell + cell]], { color: '#25518a', width: i % 4 === 0 ? 1.7 : 0.8 })
    streets.line([[-G * cell - cell, 0, i * cell - cell / 2], [G * cell + cell, 0, i * cell - cell / 2]], { color: '#25518a', width: i % 4 === 0 ? 1.7 : 0.8 })
  }
  for (let ix = -G + 1; ix < G; ix++) {
    for (let iz = -G + 1; iz < G; iz++) {
      const x = ix * cell, z = iz * cell
      const dist = Math.hypot(ix + 1.4, iz - 0.8) / G
      if (dist > 1.08 || rand() < 0.08) continue
      const h = Math.max(0.7, (1 - dist) * (1 - dist) * 12 * (0.45 + rand() * 0.9) + rand() * 1.1)
      const w = 0.62 + rand() * 0.35, d = 0.62 + rand() * 0.35
      const tall = h > 5.5
      const color = tall ? '#d7f6ff' : '#4ea4dd'
      blocks.line(outline(x, z, w, d, 0), { color, width: 0.9, wobble: 0.003 })
      blocks.line(outline(x, z, w, d, h), { color, width: tall ? 1.7 : 1, wobble: 0.003 })
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) blocks.line([[x + sx * w, 0, z + sz * d], [x + sx * w, h, z + sz * d]], { color, width: tall ? 1.2 : 0.8, wobble: 0.003 })
      const floors = Math.floor(h / 0.75)
      for (let f = 1; f < floors; f++) blocks.line(outline(x, z, w, d, f * 0.75), { color: '#2b6da3', width: 0.6, wobble: 0.002, opacity: 0.75 })
      if (tall) hubs.push([x, h, z])
    }
  }
  const links = hubs.flatMap((a, i) => hubs.slice(i + 1).filter((b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 12).map((b) => [a, b] as const)).slice(0, 26)
  for (const [a, b] of links) {
    const lift = Math.hypot(a[0] - b[0], a[2] - b[2]) * 0.42 + 0.8
    const path = Array.from({ length: 33 }, (_, i): Vec3 => {
      const t = i / 32, p = mix(a, b, t)
      return [p[0], p[1] + Math.sin(Math.PI * t) * lift, p[2]]
    })
    arcs.line(path, { color: rand() < 0.5 ? '#ff3dbb' : '#ffd23c', width: 1.5, wobble: 0.002 })
  }
  for (const h of hubs) {
    arcs.line(circleOnGround(h, 0.42, 14), { color: '#ffffff', width: 2, wobble: 0 })
    arcs.line(circleOnGround(h, 0.82, 18), { color: '#ff3dbb', width: 1, wobble: 0 })
    arcs.line([h, [h[0], 0, h[2]]], { color: '#ff3dbb', width: 0.7, opacity: 0.4, wobble: 0 })
  }
  // Where the water would reach: contours in the low corner, then hatching.
  for (let r = 0; r < 9; r++) water.line(circleOnGround([15, 0, -3], 5 + r * 1.75, 56, 0.1, r * 0.2), { color: r < 3 ? '#35f0ff' : '#1a9fe0', width: r % 3 === 0 ? 1.7 : 0.9, opacity: 1 - r * 0.07 })
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, q = rand() * 8
    const c: Vec3 = [15 + Math.cos(a) * q, 0, -3 + Math.sin(a) * q]
    water.line([c, [c[0] + 0.7, 0, c[2] - 0.7]], { color: '#35f0ff', width: 0.7, opacity: 0.55, wobble: 0.005 })
  }
  return assemble([streets, blocks, water, arcs], 'night', '#060a18', { target: [1, 4.6, 0], azimuth: 0.72, elevation: 0.44, distance: 45, mode: 'perspective' }, [0, 6, 0])
}

/** A model in grey, redlined: the coordination meeting, without the model file. */
function markup(): Showcase {
  const rand = random(71)
  const model = new Sheet(rand, 'model', undefined, undefined, 0.85)
  const red = new Sheet(rand, 'redlines')
  const idea = new Sheet(rand, 'proposal', undefined, 'multiply')
  const grey = '#667079', dark = '#2c3339', redInk = '#e0352b', orange = '#f08a24'
  const W = 8, D = 4, F = 7, FH = 1.1
  const box = (y: number): Vec3[] => [[-W, y, -D], [W, y, -D], [W, y, D], [-W, y, D], [-W, y, -D]]
  for (let f = 0; f <= F; f++) model.line(box(f * FH), { color: f === 0 || f === F ? dark : grey, width: f === 0 || f === F ? 2 : 1.2, wobble: 0.002 })
  for (let x = -W; x <= W; x += 2) {
    model.line([[x, 0, D], [x, F * FH, D]], { color: x % 4 === 0 ? dark : grey, width: x % 4 === 0 ? 1.5 : 0.9, wobble: 0.002 })
    model.line([[x, 0, -D], [x, F * FH, -D]], { color: grey, width: 0.7, wobble: 0.002, opacity: 0.6 })
  }
  for (let z = -D; z <= D; z += 2) {
    model.line([[W, 0, z], [W, F * FH, z]], { color: z === -D || z === D ? dark : grey, width: 1, wobble: 0.002 })
    model.line([[-W, 0, z], [-W, F * FH, z]], { color: grey, width: 0.7, wobble: 0.002, opacity: 0.6 })
  }
  for (let f = 0; f < F; f++) {
    for (let x = -W; x < W; x += 0.5) {
      if (Math.abs(x % 2) < 0.01) continue
      model.line([[x, f * FH + 0.12, D], [x, f * FH + 0.92, D]], { color: '#9aa4ad', width: 0.6, wobble: 0.001 })
    }
  }
  // A revision cloud: bumps around the corner that clashes.
  const cloudAt = (cx: number, cy: number, rx: number, ry: number, z: number): Vec3[] => {
    const out: Vec3[] = []
    const bumps = 15
    for (let b = 0; b < bumps; b++) {
      for (let s = 0; s <= 6; s++) {
        const a = ((b + s / 6) / bumps) * Math.PI * 2
        const lift = 1 + 0.12 * Math.sin((s / 6) * Math.PI)
        out.push([cx + Math.cos(a) * rx * lift, cy + Math.sin(a) * ry * lift, z])
      }
    }
    return out
  }
  red.line(cloudAt(5.4, 3.3, 2.5, 1.65, D + 0.04), { color: redInk, width: 3.2, wobble: 0.015 })
  red.line(cloudAt(-5.2, 7.2, 2.2, 0.85, D + 0.04), { color: redInk, width: 3, wobble: 0.015 })
  // Leaders, with arrowheads.
  const arrow = (from: Vec3, to: Vec3) => {
    red.line([from, mix(from, to, 0.5), to], { color: redInk, width: 2.6, wobble: 0.03 })
    red.line([[to[0] + 0.45, to[1] + 0.25, to[2]], to, [to[0] + 0.15, to[1] + 0.5, to[2]]], { color: redInk, width: 2.6, wobble: 0.01 })
  }
  arrow([9.8, 7.6, D + 0.04], [6.6, 4.7, D + 0.04])
  // A section line through the wing, and a tick dimension.
  red.line([[-11, 0, D + 3], [11, 0, D + 3]], { color: redInk, width: 1.6, wobble: 0.01 })
  for (const x of [-8, -4, 0, 4, 8]) red.line([[x - 0.2, 0, D + 3.2], [x + 0.2, 0, D + 2.8]], { color: redInk, width: 2.2, wobble: 0 })
  // The proposal: a canopy and a new roof volume, sketched fast.
  const canopy: Vec3[] = [[-6, 3.6, D], [-7, 3.6, D + 5], [7, 3.6, D + 5], [6, 3.6, D]]
  for (let i = 0; i < 2; i++) idea.line([...canopy, canopy[0]], { color: orange, width: 3.1, over: 0.02, wobble: 0.04 })
  for (let i = 0; i <= 26; i++) {
    const t = i / 26
    idea.line([mix(canopy[0], canopy[3], t), mix(canopy[1], canopy[2], t)], { color: orange, width: 6, brush: 'marker', opacity: 0.2, wobble: 0.03 })
  }
  for (const x of [-6.8, -2.3, 2.3, 6.8]) idea.line([[x, 0, D + 4.8], [x, 3.6, D + 4.8]], { color: orange, width: 2.7, wobble: 0.02 })
  const roof: Vec3[] = [[-3, F * FH, -2.5], [3.5, F * FH, -2.5], [3.5, F * FH, 2.5], [-3, F * FH, 2.5]]
  const up = (p: Vec3): Vec3 => [p[0], p[1] + 2.5, p[2]]
  for (let i = 0; i < 4; i++) {
    const a = roof[i], b = roof[(i + 1) % 4]
    idea.line([a, b], { color: orange, width: 2.2, wobble: 0.03, over: 0.05 })
    idea.line([up(a), up(b)], { color: orange, width: 2.8, wobble: 0.03, over: 0.05 })
    idea.line([a, up(a)], { color: orange, width: 2.2, wobble: 0.03, over: 0.05 })
  }
  return assemble([model, idea, red], 'white', '#f8f7f3', { target: [0, 4, 1.5], azimuth: 0.56, elevation: 0.27, distance: 25, mode: 'perspective' }, [0, 3.6, D + 0.05])
}

export const SHOWCASES: Record<ShowcaseId, () => Showcase> = { pavilion, tower, bridge, city, markup }
