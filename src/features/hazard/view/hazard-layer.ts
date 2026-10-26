// ─── slope-hazard layer ──────────────────────────────────────────────────────
// The study drawn on the ground, the way risk maps are read:
//   • the terrain of the hazard grid, grey outside the study area,
//   • inside it a colour per cell for the chosen layer at the current rain step
//     (susceptibility green → dark red, runoff in blues, debris in browns),
//   • water running down the gullies (runoff × contributing area) in blue
//     over any layer, so the storm reads as it advances,
//   • optionally the "maquette": the block cut out of the world, with earth
//     walls down to a base, the map hidden,
//   • the study area's outline and the exposed elements' labels, which turn
//     red once the rain reaches their critical value.
// Same placement as the flood ground layer: local (a, b) metres of the grid
// frame → (a, y, −b), rotated by frame.rotation about Y at the origin.

import * as THREE from 'three'
import type { GridFrame } from '../../flood/core/grid'
import { P_DRY, P_NONE, type HazardFrame } from '../worker/protocol'
import type { ExposedKind } from '../core/storm'

export type HazardLayerKind = 'susceptibility' | 'runoff' | 'debris'

export interface HazardLayerInit {
  nx: number
  ny: number
  dx: number
  frame: GridFrame
  /** Scene Y of the drawn ground per cell. */
  bed: Float32Array
  mask: Uint8Array | null
  /** Contributing area per cell, m² (for the water in the gullies). */
  upslopeArea: Float32Array
  /** Study-area outline, grid-local metres. */
  outline: Array<{ a: number; b: number }> | null
}

export interface HazardLabel {
  id: string
  name: string
  kind: ExposedKind
  a: number
  b: number
  /** Critical rain, mm; null = not reached. */
  rainMm: number | null
}

/** Susceptibility colour ramp: P(failure) 0 → 1. */
export const P_STOPS: Array<[number, string]> = [
  [0, '#3f9d4a'], [0.1, '#8cc63f'], [0.3, '#f2d43d'], [0.5, '#f08c2e'], [0.7, '#d9442b'], [0.9, '#8f1d1d'],
]
/** Runoff colour ramp, mm. */
export const Q_STOPS: Array<[number, string]> = [
  [0, '#e8f1f8'], [10, '#a9cfe8'], [40, '#5aa2d6'], [100, '#2366b0'], [200, '#0e2f73'],
]

const OUTSIDE = new THREE.Color(0x9a9a96)
/** Fails before any rain: too steep for the soil (rock faces, cliffs). */
export const DRY_UNSTABLE = '#6b4a7a'
const DRY = new THREE.Color(DRY_UNSTABLE)
const DEBRIS_PATH = new THREE.Color(0xa0622d)
const DEBRIS_DEPOSIT = new THREE.Color(0x5b3416)
const WATER = new THREE.Color(0x2f8fe8)
const EARTH = 0x5a4636

function ramp(stops: Array<[number, string]>): (v: number, out: THREE.Color) => THREE.Color {
  const cs = stops.map(([v, c]) => [v, new THREE.Color(c)] as const)
  return (v, out) => {
    if (v <= cs[0][0]) return out.copy(cs[0][1])
    for (let k = 1; k < cs.length; k++) {
      if (v <= cs[k][0]) return out.copy(cs[k - 1][1]).lerp(cs[k][1], (v - cs[k - 1][0]) / (cs[k][0] - cs[k - 1][0]))
    }
    return out.copy(cs[cs.length - 1][1])
  }
}
const pRamp = ramp(P_STOPS)
const qRamp = ramp(Q_STOPS)

export class HazardLayer {
  readonly object = new THREE.Group()
  private readonly surface: THREE.Mesh
  private readonly skirt: THREE.Mesh
  private readonly colors: Float32Array
  private readonly labels = new THREE.Group()
  private labelSprites: Array<{ sprite: THREE.Sprite; label: HazardLabel; reached: boolean | null }> = []
  private layer: HazardLayerKind = 'susceptibility'
  private frame: HazardFrame | null = null
  private flowThreshold: number
  /** Called each frame the layer is drawn (the system keeps the map's names hidden with it). */
  onFrame: (() => void) | null = null

  constructor(private readonly o: HazardLayerInit) {
    const { nx, ny, dx, bed } = o
    this.object.name = 'hazard-layer'
    this.object.position.set(o.frame.originX, 0, o.frame.originZ)
    this.object.rotation.y = o.frame.rotation
    // Lift the colours a hand above the drawn ground so the map never pokes through.
    const lift = Math.max(0.3, dx * 0.05)
    const pos = new Float32Array(nx * ny * 3)
    this.colors = new Float32Array(nx * ny * 3)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        pos[c * 3] = (i + 0.5) * dx
        pos[c * 3 + 1] = (Number.isFinite(bed[c]) ? bed[c] : 0) + lift
        pos[c * 3 + 2] = -(j + 0.5) * dx
      }
    }
    const idx: number[] = []
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i
        idx.push(a, a + nx + 1, a + 1, a, a + nx, a + nx + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    this.surface = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }))
    this.surface.name = 'hazard-surface'
    this.surface.onBeforeRender = () => this.onFrame?.()
    this.surface.raycast = () => { /* the model keeps the clicks */ }
    this.object.add(this.surface)

    this.skirt = this.buildSkirt(pos, lift)
    this.skirt.visible = false
    this.object.add(this.skirt)

    if (o.outline && o.outline.length > 2) this.object.add(this.buildOutline(o.outline, lift))
    this.object.add(this.labels)

    // Gullies: the top few percent of contributing area inside the study area.
    const areas = Array.from(o.upslopeArea).filter((v, c) => !o.mask || o.mask[c]).sort((a, b) => a - b)
    this.flowThreshold = areas.length ? areas[Math.floor(areas.length * 0.9)] : Infinity
    this.paint()
  }

  private buildSkirt(pos: Float32Array, lift: number): THREE.Mesh {
    const { nx, ny } = this.o
    let minY = Infinity
    for (let c = 0; c < nx * ny; c++) minY = Math.min(minY, pos[c * 3 + 1])
    const range = Math.max(...Array.from({ length: nx * ny }, (_, c) => pos[c * 3 + 1])) - minY
    const base = minY - lift - Math.max(20, range * 0.25)
    // Border cells in order around the rectangle.
    const ring: number[] = []
    for (let i = 0; i < nx; i++) ring.push(i)
    for (let j = 1; j < ny; j++) ring.push(j * nx + nx - 1)
    for (let i = nx - 2; i >= 0; i--) ring.push((ny - 1) * nx + i)
    for (let j = ny - 2; j > 0; j--) ring.push(j * nx)
    ring.push(0)
    const v: number[] = []
    for (const c of ring) v.push(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2], pos[c * 3], base, pos[c * 3 + 2])
    const idx: number[] = []
    for (let k = 0; k < ring.length - 1; k++) {
      const a = k * 2
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }
    // The bottom.
    const b0 = v.length / 3
    const corners = [0, nx - 1, ny * nx - 1, (ny - 1) * nx]
    for (const c of corners) v.push(pos[c * 3], base, pos[c * 3 + 2])
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: EARTH, side: THREE.DoubleSide }))
    m.name = 'hazard-skirt'
    m.raycast = () => { /* nothing to pick */ }
    return m
  }

  private buildOutline(outline: Array<{ a: number; b: number }>, lift: number): THREE.LineLoop {
    const pts: number[] = []
    // A vertex every half cell, so the line drapes over ridges instead of cutting through them.
    const step = this.o.dx / 2
    for (let k = 0; k < outline.length; k++) {
      const p = outline[k], q = outline[(k + 1) % outline.length]
      const n = Math.max(1, Math.ceil(Math.hypot(q.a - p.a, q.b - p.b) / step))
      for (let s = 0; s < n; s++) {
        const a = p.a + ((q.a - p.a) * s) / n, b = p.b + ((q.b - p.b) * s) / n
        pts.push(a, this.bedAt(a, b) + lift * 2, -b)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }))
    line.renderOrder = 10
    line.name = 'hazard-outline'
    return line
  }

  bedAt(a: number, b: number): number {
    const { nx, ny, dx, bed } = this.o
    const i = Math.min(nx - 1, Math.max(0, Math.floor(a / dx)))
    const j = Math.min(ny - 1, Math.max(0, Math.floor(b / dx)))
    const v = bed[j * nx + i]
    return Number.isFinite(v) ? v : 0
  }

  setLayer(layer: HazardLayerKind): void {
    this.layer = layer
    this.paint()
  }

  setFrame(frame: HazardFrame | null): void {
    this.frame = frame
    this.paint()
    this.updateLabels()
  }

  setBlock(on: boolean): void {
    this.skirt.visible = on
  }

  setLabels(labels: HazardLabel[]): void {
    for (const s of this.labelSprites) { (s.sprite.material as THREE.SpriteMaterial).map?.dispose(); s.sprite.material.dispose() }
    this.labels.clear()
    this.labelSprites = labels.map((label) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }))
      sprite.renderOrder = 20
      sprite.raycast = () => { /* labels are not picked */ }
      this.labels.add(sprite)
      return { sprite, label, reached: null }
    })
    this.updateLabels()
  }

  setLabelsVisible(on: boolean): void {
    this.labels.visible = on
  }

  private updateLabels(): void {
    const rain = this.frame?.rainMm ?? 0
    const scale = Math.max(this.o.nx, this.o.ny) * this.o.dx / 22
    for (const s of this.labelSprites) {
      const reached = s.label.rainMm !== null && rain >= s.label.rainMm
      if (reached === s.reached) continue
      s.reached = reached
      const mat = s.sprite.material as THREE.SpriteMaterial
      mat.map?.dispose()
      const { texture, aspect } = labelTexture(s.label.name, s.label.kind, reached)
      mat.map = texture
      mat.needsUpdate = true
      s.sprite.scale.set(scale * aspect * 0.45, scale * 0.45, 1)
      s.sprite.position.set(s.label.a, this.bedAt(s.label.a, s.label.b) + scale * 0.6, -s.label.b)
    }
  }

  private paint(): void {
    const { nx, ny, mask, upslopeArea } = this.o
    const f = this.frame
    const out = new THREE.Color()
    for (let c = 0; c < nx * ny; c++) {
      if (mask && !mask[c]) out.copy(OUTSIDE)
      else if (!f) out.copy(OUTSIDE).lerp(pRamp(0, new THREE.Color()), 0.6)
      else if (this.layer === 'susceptibility') {
        const p = f.pFail[c]
        if (p === P_NONE) out.copy(OUTSIDE)
        else if (p === P_DRY) out.copy(DRY)
        else pRamp(p / 250, out)
        if (f.debris[c] & 2) out.lerp(DEBRIS_DEPOSIT, 0.7)
        else if (f.debris[c] & 1) out.lerp(DEBRIS_PATH, 0.6)
      } else if (this.layer === 'runoff') {
        qRamp(f.runoff[c] / 10, out)
      } else {
        out.copy(OUTSIDE).lerp(new THREE.Color(0xd8d2c4), 0.5)
        if (f.debris[c] & 2) out.copy(DEBRIS_DEPOSIT)
        else if (f.debris[c] & 1) out.copy(DEBRIS_PATH)
      }
      // Water down the gullies grows with the event's runoff.
      if (f && (!mask || mask[c]) && upslopeArea[c] >= this.flowThreshold) {
        const q = f.runoff[c] / 10
        const w = Math.min(1, (q / 30) * Math.min(3, upslopeArea[c] / this.flowThreshold) / 1.5)
        if (w > 0.05) out.lerp(WATER, 0.25 + 0.6 * w)
      }
      this.colors[c * 3] = out.r
      this.colors[c * 3 + 1] = out.g
      this.colors[c * 3 + 2] = out.b
    }
    ;(this.surface.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.object.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        ;(x as THREE.SpriteMaterial).map?.dispose()
        x.dispose()
      }
    })
    this.object.removeFromParent()
  }
}

const KIND_GLYPH: Record<ExposedKind, string> = { housing: '⌂', school: '✎', health: '✚', road: '═', other: '•' }

function labelTexture(name: string, kind: ExposedKind, reached: boolean): { texture: THREE.CanvasTexture; aspect: number } {
  const text = `${KIND_GLYPH[kind]} ${name.length > 32 ? `${name.slice(0, 31)}…` : name}`
  const px = 28
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  g.font = `600 ${px}px system-ui, sans-serif`
  const w = Math.ceil(g.measureText(text).width) + px
  c.width = w
  c.height = Math.round(px * 1.6)
  g.font = `600 ${px}px system-ui, sans-serif`
  g.fillStyle = reached ? 'rgba(180,30,30,0.92)' : 'rgba(20,24,28,0.78)'
  const r = c.height / 2
  g.beginPath()
  g.roundRect(0, 0, w, c.height, r)
  g.fill()
  g.fillStyle = '#ffffff'
  g.textBaseline = 'middle'
  g.fillText(text, px / 2, c.height / 2 + 1)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: w / c.height }
}
