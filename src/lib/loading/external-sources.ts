// ─── External state — GIS rows, and scene removals of managed sources ────────
// Two jobs, both about state the manager does not own.
//
// 1. GIS context (terrain tiles, surrounding buildings) is TRACKED, not
//    managed: the geo system runs it, superseded by the panel's own toggles and
//    guarded by the geo epoch, so there is no executor to move. This module
//    mirrors the two geo statuses into background rows, so the Loading Center
//    shows the map filling in behind the models.
//
// 2. Point clouds and meshes are MANAGED jobs (pointcloud-source.ts,
//    mesh-source.ts). They used to be mirrored here too — tracked rows fed from
//    their stores, cancelled through a store-wide epoch that failed every
//    sibling still parsing. Their store entries can still leave the scene by
//    paths that never pass through the manager: the panel's X, the SDK's
//    remove / clear commands, a temporal replay taking over its showcase ids,
//    the landing page clearing the stores. `watchSourceRemovals` turns each of
//    those into the manager's own terms: the entry of a job still loading is a
//    cancel, the entry of a loaded job is a removal. Without it a removed scan
//    would stay "Loaded" in the Loading Center — and prune-protected, since
//    loaded rows count as on screen.
//
// Bundle rule: the runners and the geo system are lazy chunks; nothing here
// imports them. The stores and i18n are already in the entry bundle.

import i18n from '../../i18n/config'
import { createLogger } from '../logger'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useGeoStore } from '../../stores/geoStore'
import { ACTIVE_STATUSES, PRIORITY, type ExternalJobController, type SourceKind } from './types'
import type { LoadManager } from './load-manager'
import type { TerrainStatus } from '../geo/geo-types'

const log = createLogger('LoadExternal')

// ── Public surface ────────────────────────────────────────────────────────────

/**
 * The part of a zustand store this module touches. Structural on purpose: the
 * real stores satisfy it as they are, and a test can hand in a fresh one
 * without dragging the whole action surface along.
 */
export interface StoreLike<S> {
  getState(): S
  subscribe(listener: (state: S, prev: S) => void): () => void
}

export type BuildingsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface GeoSlice {
  terrainStatus: TerrainStatus
  buildingsStatus: BuildingsStatus
}

export interface ExternalTrackingDeps {
  /** Injectable for tests; defaults to the app's store. */
  stores?: { geo?: StoreLike<GeoSlice> }
}

/**
 * Start mirroring GIS context into `manager`. Call once per manager — two
 * mirrors would show every terrain fetch twice.
 *
 * Returns `stop`, which unsubscribes and nothing else: rows already tracked
 * keep their last status and nothing is cancelled.
 */
export function startExternalTracking(
  manager: Pick<LoadManager, 'track'>,
  deps: ExternalTrackingDeps = {},
): () => void {
  const geoStore = deps.stores?.geo ?? useGeoStore
  const terrain = new GisMirror(manager, 'terrain', 'terrain tiles')
  const buildings = new GisMirror(manager, 'buildings', 'buildings query')

  const syncGeo = guarded('gis', () => {
    const s = geoStore.getState()
    terrain.sync(s.terrainStatus)
    buildings.sync(s.buildingsStatus)
  })

  // Whatever is already loading when tracking starts is mirrored at once.
  syncGeo()

  const off = geoStore.subscribe((s, prev) => {
    if (s.terrainStatus !== prev.terrainStatus || s.buildingsStatus !== prev.buildingsStatus) syncGeo()
  })

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    off()
  }
}

// ── Scene removals of managed sources ─────────────────────────────────────────

interface Identified { readonly id: string }

export interface PointCloudIds { clouds: readonly Identified[] }
export interface MeshIds { meshes: readonly Identified[] }

export interface SourceRemovalDeps {
  /** Injectable for tests; default to the app's stores. */
  stores?: {
    pointCloud?: StoreLike<PointCloudIds>
    mesh?: StoreLike<MeshIds>
  }
}

/**
 * Tell the manager about every point cloud / mesh entry that leaves its store
 * by a path the manager did not start. Idempotent on the manager's side: an
 * entry the manager itself removed (Cancel, Remove, unload) finds its job
 * already cancelled / removed, and nothing happens.
 *
 * Entries no job owns — a temporal replay, anything left from before a reset —
 * are ignored.
 */
export function watchSourceRemovals(
  manager: Pick<LoadManager, 'findByResult' | 'cancel' | 'markRemoved'>,
  deps: SourceRemovalDeps = {},
): () => void {
  const pcStore = deps.stores?.pointCloud ?? usePointCloudStore
  const meshStore = deps.stores?.mesh ?? useMeshStore

  const gone = (kind: SourceKind, id: string): void => {
    const hit = manager.findByResult(kind, id)
    if (!hit) return
    if (ACTIVE_STATUSES.has(hit.status)) manager.cancel(hit.jobId)
    else if (hit.status === 'loaded' || hit.status === 'unloading') manager.markRemoved(id)
  }

  const differ = (kind: SourceKind) => (next: readonly Identified[], prev: readonly Identified[]): void => {
    if (next === prev) return
    const present = new Set(next.map((e) => e.id))
    for (const e of prev) {
      if (present.has(e.id)) continue
      try {
        gone(kind, e.id)
      } catch (err) {
        // The listener runs inside the remover's own set(): the bookkeeping
        // must never break the removal it is reporting.
        log.warn('removal bookkeeping failed', { kind, id: e.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  const clouds = differ('pointcloud')
  const meshes = differ('mesh')

  const offs = [
    pcStore.subscribe((s, prev) => clouds(s.clouds, prev.clouds)),
    meshStore.subscribe((s, prev) => meshes(s.meshes, prev.meshes)),
  ]
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    for (const off of offs) off()
  }
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
} as const

/** Resolved once, at track time: a row keeps the name it was born with. */
function label(key: keyof typeof LABEL_KEYS): string {
  return i18n.t(LABEL_KEYS[key])
}

/**
 * Run a sync from a store listener without letting it hurt the writer. The
 * listener runs INSIDE the writer's own `set()` — a throw here would surface
 * in the geo panel's handler and break work we are only watching. A write
 * that lands while a sync is running (a manager listener touching the same
 * store) re-runs the sync afterwards instead of nesting into it.
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
