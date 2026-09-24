// ─── External sources — tracked loads in the Loading Center ──────────────────
// Point clouds, meshes and GIS context keep their own executors: they own
// alignment, budgets, streaming and their workers, and moving them into the
// manager is its own piece of work (docs/MODEL_LOADING.md §13). Until then this
// module MIRRORS their store state into the LoadManager as tracked jobs
// (managed: false), so the Loading Center shows everything that is loading and
// its Cancel / Remove reach each runner's own removal.
//
// One-way by construction: the stores are the truth and the rows follow them.
// The only write back is the one a user asks for from the Loading Center
// (`onCancel`), and it goes through the same removal each panel uses — so the
// panel and the center can never disagree about whether a scan is still there.
//
// Bundle rule: pc-runner, mesh-runner and geo-system are lazy chunks. Nothing
// here imports them; the cancel functions arrive through `deps`, and the
// integrator hands in dynamic-import wrappers. The stores and i18n are already
// in the entry bundle (the toolbar imports them eagerly).
//
// Known hazard, documented rather than fixed here: pointCloudStore.removeCloud
// and meshStore.removeMesh bump a GLOBAL epoch, not a per-entry one. Removing
// ONE entry — from its panel or from the Loading Center — therefore invalidates
// every sibling still parsing. A sibling point cloud fails at its next worker
// message with 'error.cancelled' (mirrored below as a failure with code
// 'cancelled', because the file itself was fine); a sibling mesh returns early
// without touching its entry, which stays 'loading' in the store and so stays
// running here. Per-entry epochs are the fix, and they belong to the runners.

import i18n from '../../i18n/config'
import { createLogger } from '../logger'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useGeoStore } from '../../stores/geoStore'
import {
  PRIORITY,
  type ExternalJobController, type ExternalJobSpec, type LoadErrorCode, type PhaseCounters,
  type PhaseReporter, type SourceKind,
} from './types'
import type { LoadManager } from './load-manager'
import type { PointCloudEntry } from '../pointcloud/pc-types'
import type { MeshEntry } from '../mesh/mesh-types'
import type { TerrainStatus } from '../geo/geo-types'

const log = createLogger('LoadExternal')

// ── Public surface ────────────────────────────────────────────────────────────

/**
 * The part of a zustand store this module touches. Structural on purpose: the
 * real stores satisfy it as they are, and a test can hand in the real store
 * reset or a fresh one without dragging the whole action surface along.
 */
export interface StoreLike<S> {
  getState(): S
  subscribe(listener: (state: S, prev: S) => void): () => void
}

export type BuildingsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface PointCloudSlice {
  clouds: readonly PointCloudEntry[]
  removeCloud: (id: string) => void
}

export interface MeshSlice {
  meshes: readonly MeshEntry[]
}

export interface GeoSlice {
  terrainStatus: TerrainStatus
  buildingsStatus: BuildingsStatus
}

export interface ExternalTrackingDeps {
  /**
   * Stop a point cloud's runner and free what it put on the GPU: pc-runner's
   * `cancelPointCloud(id)` (terminates the worker, closes a COPC stream) plus
   * `PointCloudSystem.remove(id)` — the first two steps of PointCloudPanel's
   * removal. The third, dropping the store entry, happens HERE, once: do not
   * call removeCloud in the wrapper, every call bumps the global epoch.
   * Without it, point cloud rows are view-only (no Cancel / Remove).
   */
  cancelPointCloud?: (id: string) => void
  /**
   * The canonical mesh removal: mesh-runner's `removeMesh(id, system)`, which
   * frees the scene object AND drops the store entry itself. Without it, mesh
   * rows are view-only.
   */
  removeMesh?: (id: string) => void
  /** Injectable for tests; default to the app's stores. */
  stores?: {
    pointCloud?: StoreLike<PointCloudSlice>
    mesh?: StoreLike<MeshSlice>
    geo?: StoreLike<GeoSlice>
  }
}

/**
 * Start mirroring point clouds, meshes and GIS context into `manager`. Call
 * once per manager — two mirrors would show every scan twice.
 *
 * Returns `stop`, which unsubscribes and nothing else: rows already tracked
 * keep their last status and nothing is cancelled. Stopping is for teardown
 * (the manager is being reset or disposed alongside), not for "hide these".
 */
export function startExternalTracking(
  manager: Pick<LoadManager, 'track'>,
  deps: ExternalTrackingDeps = {},
): () => void {
  const pcStore = deps.stores?.pointCloud ?? usePointCloudStore
  const meshStore = deps.stores?.mesh ?? useMeshStore
  const geoStore = deps.stores?.geo ?? useGeoStore

  const clouds = new EntryMirror<PointCloudEntry>(manager, pointCloudKind(pcStore, deps.cancelPointCloud))
  const meshes = new EntryMirror<MeshEntry>(manager, meshKind(deps.removeMesh))
  const terrain = new GisMirror(manager, 'terrain', 'terrain tiles')
  const buildings = new GisMirror(manager, 'buildings', 'buildings query')

  const syncClouds = guarded('point clouds', () => clouds.sync(pcStore.getState().clouds))
  const syncMeshes = guarded('meshes', () => meshes.sync(meshStore.getState().meshes))
  const syncGeo = guarded('gis', () => {
    const s = geoStore.getState()
    terrain.sync(s.terrainStatus)
    buildings.sync(s.buildingsStatus)
  })

  // Whatever is already on screen or already loading when tracking starts is
  // mirrored at once — a scan that finished before we looked still shows.
  syncClouds()
  syncMeshes()
  syncGeo()

  // Subscriptions fire on EVERY write to these stores (display sliders, panel
  // toggles, placement nudges). Compare only the fields the rows depend on:
  // the list reference moves on every entry write and never for display or
  // panel state, and the per-row signature drops entry writes we do not show.
  const offs = [
    pcStore.subscribe((s, prev) => { if (s.clouds !== prev.clouds) syncClouds() }),
    meshStore.subscribe((s, prev) => { if (s.meshes !== prev.meshes) syncMeshes() }),
    geoStore.subscribe((s, prev) => {
      if (s.terrainStatus !== prev.terrainStatus || s.buildingsStatus !== prev.buildingsStatus) syncGeo()
    }),
  ]

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    for (const off of offs) off()
  }
}

// ── Store entries (point clouds, meshes) ──────────────────────────────────────

/** Where an entry is in its own lifecycle, in the manager's terms. */
type EntryPhase = 'active' | 'ready' | 'error'

interface EntryKind<E> {
  phase(e: E): EntryPhase
  /** null = not a load at all (e.g. a temporal replay) — never mirrored. */
  spec(e: E): ExternalJobSpec | null
  /** What the runner measured; null = nothing to report beyond "working". */
  progress(e: E): { fraction: number | null; counters?: PhaseCounters } | null
  errorKey(e: E): string | null
}

interface EntryRow {
  ctl: ExternalJobController
  reporter: PhaseReporter
  /** The phase last mirrored — what a change is detected against. */
  phase: EntryPhase
  /** Last reported progress, so per-chunk store writes that change nothing we show stay silent. */
  sig: string
}

/**
 * The store-list half, shared by point clouds and meshes: diff the list by id
 * on every change, open a row for an id seen for the first time, close it when
 * the id disappears.
 */
class EntryMirror<E extends { id: string }> {
  private readonly rows = new Map<string, EntryRow>()

  constructor(
    private readonly manager: Pick<LoadManager, 'track'>,
    private readonly kind: EntryKind<E>,
  ) {}

  sync(list: readonly E[]): void {
    const present = new Set<string>()
    for (const e of list) {
      present.add(e.id)
      this.apply(e)
    }
    for (const [id, row] of this.rows) {
      if (present.has(id)) continue
      this.rows.delete(id)
      // Gone from the store. Still loading means someone stopped it (its
      // panel, the Loading Center, a reset); on screen means it was removed.
      // A failed row stays as it is — it is the record of why nothing arrived.
      if (row.phase === 'active') row.ctl.cancelled()
      else if (row.phase === 'ready') row.ctl.removed()
    }
  }

  private apply(e: E): void {
    const phase = this.kind.phase(e)
    let row = this.rows.get(e.id)
    if (row && row.phase !== 'active' && row.phase !== phase) {
      // A settled row whose entry moved on again: a new life under the same id.
      // The real case is a COPC — 'ready' at its header, then its octree index
      // fails and the runner tears the cloud down. The manager cannot turn a
      // loaded job into a failed one, and leaving it "Loaded" would be a lie,
      // so the old row closes and a new one tells what happened next.
      if (row.phase === 'ready') row.ctl.removed()
      this.rows.delete(e.id)
      row = undefined
    }
    if (!row) {
      const spec = this.kind.spec(e)
      if (!spec) return
      const ctl = this.manager.track(spec)
      // Entering the phase is what flips a tracked job from queued to running.
      row = { ctl, reporter: ctl.phase('decode'), phase: 'active', sig: '' }
      this.rows.set(e.id, row)
    }
    if (row.phase !== 'active') return

    const p = this.kind.progress(e)
    if (p) {
      const sig = `${p.fraction}|${p.counters?.done ?? ''}`
      if (sig !== row.sig) {
        row.sig = sig
        row.reporter.progress(p.fraction, p.counters)
      }
    }
    if (phase === 'ready') {
      row.phase = 'ready'
      row.ctl.loaded(e.id)
    } else if (phase === 'error') {
      row.phase = 'error'
      const key = this.kind.errorKey(e)
      row.ctl.failed({ code: entryErrorCode(key), message: key ?? 'error' })
    }
  }
}

function pointCloudKind(
  store: StoreLike<PointCloudSlice>,
  cancelPointCloud: ((id: string) => void) | undefined,
): EntryKind<PointCloudEntry> {
  return {
    phase: (c) => (c.status === 'parsing' ? 'active' : c.status),
    spec: (c) => {
      // A temporal replay is a live source the panel drives, not a load: it is
      // born 'ready' with nothing to wait for, and removing it has to stop the
      // panel's replay controller, which only the panel can reach.
      if (c.sourceKind === 'temporal-replay') return null
      const id = c.id
      return entrySpec('pointcloud', c.fileName || label('pointCloud'), c.fileSize, id,
        cancelPointCloud ? () => removeCloudEverywhere(store, cancelPointCloud, id) : undefined)
    },
    // COPC clouds turn 'ready' at their header with progress 100 and 0 points
    // and only then stream, so a 0 count is "not measured yet", not a result.
    progress: (c) => {
      const fraction = c.progress > 0 ? c.progress / 100 : null
      const counters: PhaseCounters | undefined = c.pointCount > 0 ? { done: c.pointCount, unit: 'points' } : undefined
      return fraction === null && !counters ? null : { fraction, counters }
    },
    errorKey: (c) => c.errorKey,
  }
}

/**
 * PointCloudPanel's removal, in its order: stop the runner and free the GPU
 * (the integrator's wrapper), then drop the entry. Guarded on presence because
 * removeCloud bumps the global epoch even for an id that is already gone — a
 * wrapper that removed it synchronously must not fail the siblings twice.
 */
function removeCloudEverywhere(
  store: StoreLike<PointCloudSlice>,
  cancelPointCloud: (id: string) => void,
  id: string,
): void {
  try {
    cancelPointCloud(id)
  } catch (err) {
    // Still drop the entry: a row the user removed must not linger as "parsing".
    log.warn('point cloud cancel threw', { id, error: err instanceof Error ? err.message : String(err) })
  }
  const s = store.getState()
  if (s.clouds.some((c) => c.id === id)) s.removeCloud(id)
}

function meshKind(removeMesh: ((id: string) => void) | undefined): EntryKind<MeshEntry> {
  return {
    phase: (m) => (m.status === 'loading' ? 'active' : m.status),
    spec: (m) => {
      const id = m.id
      return entrySpec('mesh', m.fileName || label('mesh'), m.fileSize, id,
        removeMesh ? () => removeMesh(id) : undefined)
    },
    // The decode is one opaque GLTFLoader / OBJLoader call on the main thread:
    // there is no fraction to report, only that it is still working.
    progress: () => null,
    errorKey: (m) => m.errorKey,
  }
}

function entrySpec(
  kind: SourceKind, fileName: string, sizeBytes: number, resultId: string, onCancel: (() => void) | undefined,
): ExternalJobSpec {
  return {
    kind,
    fileName,
    sizeBytes,
    // A file the user picked, not ambient context: it sorts with the models,
    // ahead of the terrain and buildings that fill in behind them.
    priority: PRIORITY.normal,
    plan: [{ id: 'decode', weight: 1 }],
    resultId,
    onCancel,
  }
}

/**
 * The runners speak in i18n keys; the manager speaks in LoadErrorCodes. Map
 * the few that mean something specific — above all 'error.cancelled', which
 * the global epoch produces for a perfectly good file — and let everything
 * else be a content failure. The raw key stays in `message` for the details.
 */
function entryErrorCode(errorKey: string | null): LoadErrorCode {
  if (!errorKey) return 'parse'
  if (errorKey === 'error.cancelled') return 'cancelled'
  if (errorKey === 'error.timeout') return 'timeout'
  if (errorKey === 'error.workerFailed') return 'worker-crash'
  if (/outofmemory/i.test(errorKey)) return 'out-of-memory'
  if (errorKey === 'error.budgetExhausted' || /toolarge/i.test(errorKey)) return 'unsupported'
  return 'parse'
}

// ── GIS context (terrain, surrounding buildings) ──────────────────────────────

type GisStatus = TerrainStatus | BuildingsStatus

/**
 * One GIS slot, driven by status transitions rather than ids: every move to
 * 'loading' is a new fetch and a new row. No onCancel — these runs are
 * superseded by the panel's toggles (and dropped by the geo epoch), never
 * cancelled from outside, so the center offers no Cancel it cannot honour.
 */
class GisMirror {
  private row: { ctl: ExternalJobController; loaded: boolean } | null = null
  private last: GisStatus | null = null

  constructor(
    private readonly manager: Pick<LoadManager, 'track'>,
    private readonly labelKey: 'terrain' | 'buildings',
    private readonly what: string,
  ) {}

  sync(status: GisStatus): void {
    if (status === this.last) return
    this.last = status
    const row = this.row
    if (row && !row.loaded) {
      switch (status) {
        case 'ready':
        case 'empty':
          // An empty district is an answer, not a failure: the query ran and
          // found nothing to draw.
          row.loaded = true
          row.ctl.loaded()
          return
        case 'error':
          this.row = null
          row.ctl.failed({ code: 'network', message: `${this.what} failed` })
          return
        case 'idle':
          // Toggled off, map mode left, or the scene reset under it.
          this.row = null
          row.ctl.cancelled()
          return
        case 'loading':
          return
      }
    }
    if (row && row.loaded && status !== 'ready' && status !== 'empty') {
      // What that row put on screen is gone (toggled off) or being replaced.
      this.row = null
      row.ctl.removed()
    }
    if (status === 'loading') {
      const ctl = this.manager.track({
        kind: 'gis',
        fileName: label(this.labelKey),
        priority: PRIORITY.background,
        plan: [{ id: 'fetch', weight: 1 }],
      })
      // Tile and Overpass fetches report no fraction: activity only.
      ctl.phase('fetch')
      this.row = { ctl, loaded: false }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LABEL_KEYS = {
  terrain: 'loading:external.terrain',
  buildings: 'loading:external.buildings',
  pointCloud: 'loading:external.pointCloud',
  mesh: 'loading:external.mesh',
} as const

/** Resolved once, at track time: a row keeps the name it was born with. */
function label(key: keyof typeof LABEL_KEYS): string {
  return i18n.t(LABEL_KEYS[key])
}

/**
 * Run a sync from a store listener without letting it hurt the writer. The
 * listener runs INSIDE the runner's own `set()` — a throw here would surface
 * in pc-runner's worker handler and break the load we are only watching. A
 * write that lands while a sync is running (a manager listener touching the
 * same store) re-runs the sync afterwards instead of nesting into it.
 */
function guarded(what: string, run: () => void): () => void {
  let busy = false
  let again = false
  return () => {
    if (busy) { again = true; return }
    busy = true
    try {
      for (let guard = 0; guard < 10; guard++) {
        again = false
        run()
        if (!again) break
      }
    } catch (err) {
      log.warn(`${what} mirror failed`, { error: err instanceof Error ? err.message : String(err) })
    } finally {
      busy = false
      again = false
    }
  }
}
