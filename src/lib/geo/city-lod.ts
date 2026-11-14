// ─── city-lod ─────────────────────────────────────────────────────────────────
// The far city as a set of cells that follow the camera: asks city-cells which
// ones the view needs, has a worker build them, keeps them as meshes and lets
// them go when the view has moved on or the budget is spent.
// See city-cells.ts for the rules and where the data comes from.
//
// Memory (WP1): a mesh keeps NOTHING on the CPU once it is on the GPU — every
// attribute array is dropped on upload, positions included, after each
// building has been seated on the ground and the positions packed to 16 bits.
// So a new ground (the relief arrived, the exaggeration changed) rebuilds the
// meshes instead of moving their vertices, the old ones staying until the new
// ones replace them; and a restored WebGL context rebuilds everything
// (`contextRestored`), since three has nothing left to upload again.

import * as THREE from 'three'
import { createUnlitFacadeMaterial } from './facade-shader'
import {
  cellsInRange, admitCells, planUnits, quantizePositions, fadeLevel, FADE_LEVELS,
  type CellLod, type CityUnit, type CityView,
} from './city-cells'
import { seatBuilding } from './city-cells-look'
import type { ContextTone } from './building-mesh'
import type { CellRequest, CellResponse } from '../../workers/city-cells.worker'

/** Cells being built at once. One worker: more would only queue behind it. */
const MAX_IN_FLIGHT = 2
/** The plan is re-read this often; a camera does not cross a cell in less. */
const PLAN_EVERY_MS = 200
/** A cell out of the plan this long is unloaded. */
const UNLOAD_AFTER_MS = 2_500
/** A cell that failed to build is not asked for again for this long. */
const RETRY_AFTER_MS = 30_000

export interface CityLodStats {
  /** Meshes held (a far tile is one, for four cells). */
  cells: number
  mid: number
  far: number
  /** Of `far`, how many are whole z14 tiles. */
  farTiles: number
  triangles: number
  buildings: number
  inFlight: number
  /** Vertex + index bytes on the GPU. Nothing is kept on the CPU. */
  bytes: number
  /** Meshes the current plan asks for. */
  wanted: number
  lastError: string | null
}

export interface CityLodGround {
  /** Identity of the ground: a new object means every cell is rebuilt. */
  key: unknown
  /** Scene z of the ground at a centred-normalized position. */
  z(nx: number, ny: number): number
}

export interface CityLod {
  /** Parent under the geo root: cells are in its normalized planar space. */
  readonly group: THREE.Group
  /** OpenMapTiles URL template, or null to draw nothing. */
  setSource(template: string | null): void
  /** The full-detail district's box; its buildings are left out of the cells. */
  setExclude(box: CellRequest['exclude']): void
  setTone(tone: ContextTone): void
  /** Triangles the planner may spend (city-cells cityAdmitTriangles). */
  setBudget(triangles: number): void
  /** Per frame (cheap: it re-plans a few times a second). null = draw nothing. */
  update(view: CityView | null, ground: CityLodGround | null, anchor: { lat: number; lon: number }): void
  /** The WebGL context came back: three has no arrays to re-upload, rebuild. */
  contextRestored(): void
  stats(): CityLodStats
  dispose(): void
}

interface Unit {
  key: string
  lod: CellLod
  tile: boolean
  /** Cell keys it draws. */
  cells: string[]
  /** null = built, and there is nothing there (sea, a park). */
  mesh: THREE.Mesh | null
  triangles: number
  buildings: number
  bytes: number
  /** The ground it was seated on. */
  groundKey: unknown
  /** When its mesh appeared, for the fade-in; null = not fading. */
  bornAt: number | null
  lastWanted: number
}

/** Drop a buffer's CPU copy once three has it on the GPU. */
function dropOnUpload(this: THREE.BufferAttribute): void {
  ;(this as unknown as { array: unknown }).array = null
}

/**
 * The same unlit facade, dissolved in through a screen-door pattern: no
 * transparency, so no sorting and no depth trouble. A few shared materials,
 * one per step of the fade; a mesh steps through them and then goes back to
 * the opaque one, whose shader has no `discard` and so keeps early depth.
 */
function createFadeMaterial(level: number): THREE.MeshBasicMaterial {
  const m = createUnlitFacadeMaterial()
  m.name = `facade-unlit-fade-${level}`
  const base = m.onBeforeCompile
  const uCellFade = { value: (level + 1) / (FADE_LEVELS + 1) }
  m.customProgramCacheKey = () => 'facade-unlit-look-fade'
  m.onBeforeCompile = (shader, renderer) => {
    base.call(m, shader, renderer)
    const token = '#include <clipping_planes_fragment>'
    if (!shader.fragmentShader.includes(token)) throw new Error('city-lod: three no longer emits <clipping_planes_fragment>')
    shader.uniforms.uCellFade = uCellFade
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCellFade;')
      .replace(token, /* glsl */ `${token}
        {
          // Interleaved gradient noise: an even, fine screen-door.
          float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (n >= uCellFade) discard;
        }`)
  }
  return m
}

export function createCityLod(): CityLod {
  const group = new THREE.Group()
  group.name = 'city-cells'
  const material = createUnlitFacadeMaterial()
  const fadeMaterials = Array.from({ length: FADE_LEVELS }, (_, i) => createFadeMaterial(i))

  const units = new Map<string, Unit>()
  const inFlight = new Map<string, { id: number; lod: CellLod }>()
  const failedUntil = new Map<string, number>()
  /** What a cell cost at a level the last time it was built — kept for good. */
  const known = new Map<string, number>()
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<number, { unit: CityUnit; generation: number; groundKey: unknown }>()

  let template: string | null = null
  let exclude: CellRequest['exclude'] = null
  let tone: ContextTone = 'natural'
  let budget = 0
  let generation = 0
  let lastPlan = -Infinity
  /** The latest plan, by unit key. */
  let plan = new Map<string, CityUnit>()
  let lastError: string | null = null
  let ground: CityLodGround | null = null
  let anchor = { lat: 0, lon: 0 }
  let disposed = false

  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('../../workers/city-cells.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<CellResponse>) => onReply(e.data)
    return worker
  }

  function disposeUnit(unit: Unit): void {
    if (unit.mesh) {
      group.remove(unit.mesh)
      unit.mesh.geometry.dispose()
    }
    units.delete(unit.key)
  }

  /** Everything built so far is for a state that no longer holds. */
  function reset(): void {
    generation++
    for (const unit of [...units.values()]) disposeUnit(unit)
    inFlight.clear()
    pending.clear()
    failedUntil.clear()
    plan = new Map()
    lastPlan = -Infinity
  }

  /**
   * Seat each building on the ground under its footprint (body on the highest
   * ground, skirt down to the lowest — city-cells-look seatBuilding), then pack
   * the positions. `pos` is local to `origin` (normalized units, z in scene units).
   */
  function seatAndPack(
    geometry: THREE.BufferGeometry, pos: Float32Array, ranges: Uint32Array, origin: { x: number; y: number },
  ): { centre: [number, number, number]; scale: number } {
    if (ground) {
      const z = (nx: number, ny: number): number => ground!.z(nx, ny)
      for (let j = 0; j < ranges.length; j += 2) seatBuilding(pos, ranges[j], ranges[j + 1], origin, z)
    }
    const q = quantizePositions(pos)
    geometry.setAttribute('position', new THREE.BufferAttribute(q.array, 3, true))
    return { centre: q.centre, scale: q.scale }
  }

  function overlaps(a: readonly string[], b: readonly string[]): boolean {
    for (const k of a) if (b.includes(k)) return true
    return false
  }

  /** A unit has arrived: let go of what it now draws instead. */
  function retireUnder(unit: Unit): void {
    for (const other of [...units.values()]) {
      if (other === unit || !overlaps(other.cells, unit.cells)) continue
      if (unit.tile || !other.tile) { disposeUnit(other); continue }
      // A far tile splitting into cells: keep it until every cell of it that
      // the plan still draws has a mesh of its own, or it would leave holes.
      const done = other.cells.every((c) => !planDrawsCell(c) || (units.get(c)?.lod != null))
      if (done) disposeUnit(other)
    }
  }

  function drawnElsewhere(cell: string, except: Unit): boolean {
    for (const u of units.values()) if (u !== except && u.cells.includes(cell)) return true
    return false
  }

  function planDrawsCell(cell: string): boolean {
    if (plan.has(cell)) return true
    for (const u of plan.values()) if (u.tile && u.cells.includes(cell)) return true
    return false
  }

  function onReply(msg: CellResponse): void {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    if (!p || disposed) return
    const key = p.unit.key
    if (inFlight.get(key)?.id === msg.id) inFlight.delete(key)
    if (p.generation !== generation) return
    if (msg.type === 'error') {
      lastError = msg.message
      failedUntil.set(key, performance.now() + RETRY_AFTER_MS)
      return
    }
    if (p.unit.tile && msg.quarters) {
      p.unit.cells.forEach((c, i) => known.set(`${c}|far`, msg.quarters![i] ?? 0))
    } else {
      known.set(`${key}|${p.unit.lod}`, msg.triangles)
    }
    const prev = units.get(key)
    const unit: Unit = {
      key, lod: p.unit.lod, tile: p.unit.tile, cells: p.unit.cells, mesh: null,
      triangles: msg.triangles, buildings: msg.buildings, bytes: 0, groundKey: p.groundKey,
      bornAt: null, lastWanted: prev?.lastWanted ?? performance.now(),
    }
    if (msg.triangles > 0) {
      const geometry = new THREE.BufferGeometry()
      let positions: Float32Array | null = null
      for (const a of msg.attributes) {
        if (a.name === 'position') { positions = a.array as Float32Array; continue }
        geometry.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized))
      }
      if (msg.index) geometry.setIndex(new THREE.BufferAttribute(msg.index, 1))
      if (!positions) { lastError = 'cell without positions'; return }
      const packed = seatAndPack(geometry, positions, msg.ranges, msg.origin)
      geometry.computeBoundingSphere()
      for (const attr of Object.values(geometry.attributes)) {
        const a = attr as THREE.BufferAttribute
        unit.bytes += a.array.byteLength
        a.onUpload(dropOnUpload)
      }
      if (geometry.index) {
        unit.bytes += geometry.index.array.byteLength
        geometry.index.onUpload(dropOnUpload)
      }
      // Nothing else to read from them: positions are packed, every building seated.
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `city-cell ${key} ${p.unit.lod}`
      mesh.position.set(msg.origin.x + packed.centre[0], msg.origin.y + packed.centre[1], packed.centre[2])
      mesh.scale.setScalar(packed.scale)
      // With the district's buildings: above the tiles and the ground layers.
      mesh.renderOrder = 5
      // Not a pick target: these are scenery, and the CPU copy is gone anyway.
      mesh.raycast = () => {}
      unit.mesh = mesh
      // A first appearance dissolves in; a replacement (new level, new ground)
      // takes its predecessor's place at once.
      const replacing = !!prev?.mesh || [...units.values()].some((o) => o.mesh && overlaps(o.cells, unit.cells))
      if (!replacing) {
        unit.bornAt = performance.now()
        mesh.material = fadeMaterials[0]
      }
      group.add(mesh)
    }
    if (prev) disposeUnit(prev)
    units.set(key, unit)
    retireUnder(unit)
  }

  function request(u: CityUnit): void {
    if (!template) return
    const id = nextId++
    inFlight.set(u.key, { id, lod: u.lod })
    pending.set(id, { unit: u, generation, groundKey: ground?.key ?? null })
    const msg: CellRequest = {
      type: 'build-cell', id, template, x: u.x, y: u.y, tile: u.tile, lod: u.lod,
      anchorLat: anchor.lat, anchorLon: anchor.lon, contextTone: tone, exclude,
    }
    ensureWorker().postMessage(msg)
  }

  /** Step the meshes that are dissolving in. Every frame, a handful at most. */
  function fade(now: number): void {
    for (const unit of units.values()) {
      if (unit.bornAt === null || !unit.mesh) continue
      const level = fadeLevel(now - unit.bornAt)
      if (level === null) {
        unit.mesh.material = material
        unit.bornAt = null
      } else {
        unit.mesh.material = fadeMaterials[level]
      }
    }
  }

  return {
    group,

    setSource(next) {
      if (next === template) return
      template = next
      reset()
    },

    setExclude(box) {
      const same = (!box && !exclude) || (!!box && !!exclude
        && box.minNx === exclude.minNx && box.maxNx === exclude.maxNx
        && box.minNy === exclude.minNy && box.maxNy === exclude.maxNy)
      if (same) return
      exclude = box
      reset()
    },

    setTone(next) {
      if (next === tone) return
      tone = next
      reset()
    },

    setBudget(triangles) { budget = triangles },

    update(view, nextGround, nextAnchor) {
      if (disposed) return
      if (nextAnchor.lat !== anchor.lat || nextAnchor.lon !== anchor.lon) {
        // The scale every cell was built with has changed.
        anchor = { ...nextAnchor }
        reset()
      }
      ground = nextGround
      const now = performance.now()
      fade(now)
      if (now - lastPlan < PLAN_EVERY_MS) return
      lastPlan = now

      const current = new Map<string, CellLod>()
      for (const u of units.values()) for (const c of u.cells) current.set(c, u.lod)
      const admitted = view && template && budget > 0
        ? admitCells(cellsInRange(view, current), budget, (key, lod) => known.get(`${key}|${lod}`))
        : []
      const wanted = planUnits(admitted)
      plan = new Map(wanted.map((u) => [u.key, u]))
      const groundKey = ground?.key ?? null
      for (const w of wanted) {
        const unit = units.get(w.key)
        if (unit) unit.lastWanted = now
        if (unit && unit.lod === w.lod && unit.groundKey === groundKey) continue
        const flying = inFlight.get(w.key)
        if (flying && flying.lod === w.lod) continue
        if (inFlight.size >= MAX_IN_FLIGHT) continue
        if ((failedUntil.get(w.key) ?? 0) > now) continue
        request(w)
      }
      for (const unit of [...units.values()]) {
        if (now - unit.lastWanted <= UNLOAD_AFTER_MS) continue
        // Its replacement (the other level) has not arrived: unloading now
        // would open a hole for the time the worker takes. retireUnder lets
        // it go the moment the new mesh is up.
        if (unit.mesh && unit.cells.some((c) => planDrawsCell(c) && !drawnElsewhere(c, unit))) continue
        disposeUnit(unit)
      }
    },

    contextRestored() { reset() },

    stats() {
      let mid = 0, far = 0, farTiles = 0, triangles = 0, bytes = 0, buildings = 0
      for (const u of units.values()) {
        if (u.lod === 'mid') mid++; else far++
        if (u.tile) farTiles++
        triangles += u.triangles
        bytes += u.bytes
        buildings += u.buildings
      }
      return {
        cells: units.size, mid, far, farTiles, triangles, buildings, inFlight: inFlight.size, bytes,
        wanted: plan.size, lastError,
      }
    },

    dispose() {
      disposed = true
      reset()
      worker?.terminate()
      worker = null
      material.dispose()
      for (const m of fadeMaterials) m.dispose()
      group.removeFromParent()
    },
  }
}
