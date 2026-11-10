// ─── city-lod ─────────────────────────────────────────────────────────────────
// The far city as a set of cells that follow the camera: asks city-cells which
// ones the view needs, has a worker build them, keeps them as meshes and lets
// them go when the view has moved on or the triangle budget is spent.
// See city-cells.ts for the rules and where the data comes from.

import * as THREE from 'three'
import { createUnlitFacadeMaterial } from './facade-shader'
import {
  cellsInRange, admitCells, cellKey, type CellLod, type CellWant, type CityView,
} from './city-cells'
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
  cells: number
  mid: number
  far: number
  triangles: number
  buildings: number
  inFlight: number
  /** Vertex + index bytes held, an estimate of GPU memory. */
  bytes: number
  wanted: number
  lastError: string | null
}

export interface CityLodGround {
  /** Identity of the ground: a new object means every cell is re-seated. */
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
  setBudget(triangles: number): void
  /** Per frame (cheap: it re-plans a few times a second). null = draw nothing. */
  update(view: CityView | null, ground: CityLodGround | null, anchor: { lat: number; lon: number }): void
  stats(): CityLodStats
  dispose(): void
}

interface Cell {
  key: string
  lod: CellLod
  /** null = built, and there is nothing there (sea, a park). */
  mesh: THREE.Mesh | null
  triangles: number
  buildings: number
  bytes: number
  /** Per building: first vertex, end vertex. */
  ranges: Uint32Array
  /** Per building: centre, centred-normalized. */
  centres: Float64Array
  /** Per building: the ground z its vertices currently carry. */
  seated: Float32Array
  lastWanted: number
}

export function createCityLod(): CityLod {
  const group = new THREE.Group()
  group.name = 'city-cells'
  const material = createUnlitFacadeMaterial()

  const cells = new Map<string, Cell>()
  const inFlight = new Map<string, { id: number; lod: CellLod }>()
  const failedUntil = new Map<string, number>()
  /** What a cell cost at a level the last time it was built — kept for good. */
  const known = new Map<string, number>()
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<number, { key: string; lod: CellLod; generation: number }>()

  let template: string | null = null
  let exclude: CellRequest['exclude'] = null
  let tone: ContextTone = 'natural'
  let budget = 0
  let generation = 0
  let lastPlan = -Infinity
  let wantedCount = 0
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

  function disposeCell(cell: Cell): void {
    if (cell.mesh) {
      group.remove(cell.mesh)
      cell.mesh.geometry.dispose()
    }
    cells.delete(cell.key)
  }

  /** Everything built so far is for a state that no longer holds. */
  function reset(): void {
    generation++
    for (const cell of [...cells.values()]) disposeCell(cell)
    inFlight.clear()
    pending.clear()
    failedUntil.clear()
    lastPlan = -Infinity
  }

  /** Put each building of a cell on the ground under its own centre. */
  function seat(cell: Cell): void {
    if (!cell.mesh) return
    const pos = cell.mesh.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    let moved = false
    for (let j = 0; j < cell.seated.length; j++) {
      const want = ground ? ground.z(cell.centres[j * 2], cell.centres[j * 2 + 1]) : 0
      const delta = (Number.isFinite(want) ? want : 0) - cell.seated[j]
      if (delta === 0) continue
      for (let v = cell.ranges[j * 2]; v < cell.ranges[j * 2 + 1]; v++) arr[v * 3 + 2] += delta
      cell.seated[j] += delta
      moved = true
    }
    if (moved) {
      pos.needsUpdate = true
      cell.mesh.geometry.computeBoundingSphere()
    }
  }

  function onReply(msg: CellResponse): void {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    if (!p || disposed) return
    if (inFlight.get(p.key)?.id === msg.id) inFlight.delete(p.key)
    if (p.generation !== generation) return
    if (msg.type === 'error') {
      lastError = msg.message
      failedUntil.set(p.key, performance.now() + RETRY_AFTER_MS)
      return
    }
    known.set(`${p.key}|${p.lod}`, msg.triangles)
    const prev = cells.get(p.key)
    if (prev) disposeCell(prev)
    const cell: Cell = {
      key: p.key, lod: p.lod, mesh: null, triangles: msg.triangles, buildings: msg.buildings, bytes: 0,
      ranges: msg.ranges, centres: new Float64Array(msg.ranges.length), seated: new Float32Array(msg.ranges.length / 2),
      lastWanted: performance.now(),
    }
    if (msg.triangles > 0) {
      const geometry = new THREE.BufferGeometry()
      for (const a of msg.attributes) {
        geometry.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized))
        cell.bytes += a.array.byteLength
      }
      if (msg.index) {
        geometry.setIndex(new THREE.BufferAttribute(msg.index, 1))
        cell.bytes += msg.index.byteLength
      }
      const arr = geometry.attributes.position.array as Float32Array
      for (let j = 0; j < cell.seated.length; j++) {
        const a = msg.ranges[j * 2], b = msg.ranges[j * 2 + 1]
        let sx = 0, sy = 0
        for (let v = a; v < b; v++) { sx += arr[v * 3]; sy += arr[v * 3 + 1] }
        const n = Math.max(1, b - a)
        cell.centres[j * 2] = msg.origin.x + sx / n
        cell.centres[j * 2 + 1] = msg.origin.y + sy / n
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `city-cell ${p.key} ${p.lod}`
      mesh.position.set(msg.origin.x, msg.origin.y, 0)
      // With the district's buildings: above the tiles and the ground layers.
      mesh.renderOrder = 5
      // Not a pick target: these are scenery, and a ray against a hundred
      // thousand triangles per cell on every pointer move is not free.
      mesh.raycast = () => {}
      cell.mesh = mesh
      geometry.computeBoundingSphere()
      seat(cell)
      group.add(mesh)
    }
    cells.set(p.key, cell)
  }

  function request(w: CellWant): void {
    if (!template) return
    const key = cellKey(w)
    const id = nextId++
    inFlight.set(key, { id, lod: w.lod })
    pending.set(id, { key, lod: w.lod, generation })
    const msg: CellRequest = {
      type: 'build-cell', id, template, x: w.x, y: w.y, lod: w.lod,
      anchorLat: anchor.lat, anchorLon: anchor.lon, contextTone: tone, exclude,
    }
    ensureWorker().postMessage(msg)
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
      if ((nextGround?.key ?? null) !== (ground?.key ?? null)) {
        ground = nextGround
        for (const cell of cells.values()) seat(cell)
      } else {
        ground = nextGround
      }
      const now = performance.now()
      if (now - lastPlan < PLAN_EVERY_MS) return
      lastPlan = now

      const current = new Map<string, CellLod>()
      for (const c of cells.values()) current.set(c.key, c.lod)
      const wanted = view && template && budget > 0
        ? admitCells(cellsInRange(view, current), budget, (key, lod) => known.get(`${key}|${lod}`))
        : []
      wantedCount = wanted.length
      for (const w of wanted) {
        const key = cellKey(w)
        const cell = cells.get(key)
        if (cell) cell.lastWanted = now
        if (cell && cell.lod === w.lod) continue
        const flying = inFlight.get(key)
        if (flying && flying.lod === w.lod) continue
        if (inFlight.size >= MAX_IN_FLIGHT) continue
        if ((failedUntil.get(key) ?? 0) > now) continue
        request(w)
      }
      for (const cell of [...cells.values()]) {
        if (now - cell.lastWanted > UNLOAD_AFTER_MS) disposeCell(cell)
      }
    },

    stats() {
      let mid = 0, far = 0, triangles = 0, bytes = 0, buildings = 0
      for (const c of cells.values()) {
        if (c.lod === 'mid') mid++; else far++
        triangles += c.triangles
        bytes += c.bytes
        buildings += c.buildings
      }
      return { cells: cells.size, mid, far, triangles, buildings, inFlight: inFlight.size, bytes, wanted: wantedCount, lastError }
    },

    dispose() {
      disposed = true
      reset()
      worker?.terminate()
      worker = null
      material.dispose()
      group.removeFromParent()
    },
  }
}
