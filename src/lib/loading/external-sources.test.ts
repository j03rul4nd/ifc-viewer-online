// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18n from '../../i18n/config'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useGeoStore } from '../../stores/geoStore'
import { startExternalTracking } from './external-sources'
import { LoadManager } from './load-manager'
import { createResourcePolicy } from './resource-policy'
import type { ExternalJobController, ExternalJobSpec, LoadJobView, PhaseCounters, PhaseId } from './types'
import { NO_OFFSET, type PointCloudEntry } from '../pointcloud/pc-types'
import type { MeshEntry } from '../mesh/mesh-types'

// ── Test doubles ──────────────────────────────────────────────────────────────

type Call =
  | ['phase', PhaseId]
  | ['progress', number | null, PhaseCounters | undefined]
  | ['loaded', string | undefined]
  | ['failed', { code: string; message: string }]
  | ['cancelled']
  | ['removed']

interface FakeJob {
  spec: ExternalJobSpec
  calls: Call[]
}

/** Records every track() and every controller call, in order. */
function fakeManager() {
  const jobs: FakeJob[] = []
  const track = (spec: ExternalJobSpec): ExternalJobController => {
    const job: FakeJob = { spec, calls: [] }
    jobs.push(job)
    return {
      id: `x${jobs.length}`,
      phase: (id) => {
        job.calls.push(['phase', id])
        return {
          progress: (fraction, counters) => { job.calls.push(['progress', fraction, counters]) },
          done: () => {},
        }
      },
      loaded: (resultId) => { job.calls.push(['loaded', resultId]) },
      failed: (error) => { job.calls.push(['failed', { code: error.code, message: error.message }]) },
      cancelled: () => { job.calls.push(['cancelled']) },
      removed: () => { job.calls.push(['removed']) },
    }
  }
  return { jobs, manager: { track } }
}

function cloud(patch: Partial<PointCloudEntry> & { id: string }): PointCloudEntry {
  return {
    fileName: `${patch.id}.laz`, fileSize: 40_000_000, format: 'laz',
    status: 'parsing', errorKey: null, progress: 0, pointCount: 0, declaredCount: null,
    truncated: false, streamErrorKey: null, visible: true, frame: null,
    attributes: { color: false, intensity: false, classification: false, confidence: false },
    alignment: null, alignedToModelId: null, fileKey: `key:${patch.id}`, loadedAt: 0,
    ...patch,
  }
}

function mesh(patch: Partial<MeshEntry> & { id: string }): MeshEntry {
  return {
    fileName: `${patch.id}.glb`, fileSize: 2_000_000, format: 'glb', status: 'loading',
    errorKey: null, visible: true,
    stats: { meshes: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0 },
    frame: null, placement: { ...NO_OFFSET },
    fileKey: `key:${patch.id}`, loadedAt: 0,
    ...patch,
  }
}

const pc = () => usePointCloudStore.getState()
const ms = () => useMeshStore.getState()
const setTerrain = (terrainStatus: 'idle' | 'loading' | 'ready' | 'error') => useGeoStore.setState({ terrainStatus })
const setBuildings = (buildingsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error') =>
  useGeoStore.setState({ buildingsStatus })

let stops: Array<() => void> = []
function start(...args: Parameters<typeof startExternalTracking>): () => void {
  const stop = startExternalTracking(...args)
  stops.push(stop)
  return stop
}

beforeEach(() => {
  usePointCloudStore.setState({ clouds: [], activeCloudId: null, epoch: 0 })
  useMeshStore.setState({ meshes: [], activeMeshId: null, epoch: 0 })
  useGeoStore.setState({ terrainStatus: 'idle', buildingsStatus: 'idle' })
})

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
})

// ── Point clouds ──────────────────────────────────────────────────────────────

describe('external tracking — point clouds', () => {
  it('parsing → progress → ready mirrors one row, deduping writes that change nothing shown', () => {
    const { jobs, manager } = fakeManager()
    start(manager)

    pc().addCloud(cloud({ id: 'pc-1' }))
    expect(jobs).toHaveLength(1)
    expect(jobs[0].spec).toMatchObject({
      kind: 'pointcloud', fileName: 'pc-1.laz', sizeBytes: 40_000_000, resultId: 'pc-1',
      plan: [{ id: 'decode', weight: 1 }],
    })
    // Nothing measured yet: the row is running, with no made-up fraction.
    expect(jobs[0].calls).toEqual([['phase', 'decode']])

    pc().updateCloud('pc-1', { progress: 40, pointCount: 1000 })
    pc().setVisible('pc-1', false)                        // not something the row shows
    pc().updateCloud('pc-1', { progress: 40, pointCount: 1000 })
    pc().updateCloud('pc-1', { progress: 55, pointCount: 2000 })
    pc().updateCloud('pc-1', { status: 'ready', progress: 100, pointCount: 2500 })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].calls).toEqual([
      ['phase', 'decode'],
      ['progress', 0.4, { done: 1000, unit: 'points' }],
      ['progress', 0.55, { done: 2000, unit: 'points' }],
      ['progress', 1, { done: 2500, unit: 'points' }],
      ['loaded', 'pc-1'],
    ])

    // Later writes (streaming COPC nodes, visibility) never reopen the row.
    pc().updateCloud('pc-1', { pointCount: 9000 })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].calls).toHaveLength(5)
  })

  it('an error fails the row with the runner key; a global-epoch cancel is not called a parse failure', () => {
    const { jobs, manager } = fakeManager()
    start(manager)

    pc().addCloud(cloud({ id: 'a' }))
    pc().addCloud(cloud({ id: 'b' }))
    pc().updateCloud('a', { status: 'error', errorKey: 'error.plyMalformed', progress: 0 })
    pc().updateCloud('b', { status: 'error', errorKey: 'error.cancelled', progress: 0 })

    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['failed', { code: 'parse', message: 'error.plyMalformed' }])
    expect(jobs[1].calls[jobs[1].calls.length - 1]).toEqual(['failed', { code: 'cancelled', message: 'error.cancelled' }])

    // The failed entry staying in the list (it carries its error) changes nothing,
    // and removing it later leaves the failure on record.
    pc().updateCloud('a', { visible: false })
    pc().removeCloud('a')
    expect(jobs[0].calls.filter((c) => c[0] === 'failed')).toHaveLength(1)
    expect(jobs[0].calls.some((c) => c[0] === 'cancelled' || c[0] === 'removed')).toBe(false)
    expect(jobs).toHaveLength(2)
  })

  it('removal while parsing → cancelled; removal after ready → removed', () => {
    const { jobs, manager } = fakeManager()
    start(manager)

    pc().addCloud(cloud({ id: 'parsing' }))
    pc().addCloud(cloud({ id: 'done' }))
    pc().updateCloud('done', { status: 'ready', progress: 100, pointCount: 10 })

    pc().removeCloud('parsing')
    pc().removeCloud('done')
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['cancelled'])
    expect(jobs[1].calls[jobs[1].calls.length - 1]).toEqual(['removed'])

    // clearClouds (back to the landing) closes every live row the same way.
    pc().addCloud(cloud({ id: 'c' }))
    pc().clearClouds()
    expect(jobs[2].calls[jobs[2].calls.length - 1]).toEqual(['cancelled'])
  })

  it('a cloud already ready when first seen is tracked and loaded at once — also when tracking starts late', () => {
    pc().addCloud(cloud({ id: 'early', status: 'ready', progress: 100, pointCount: 500 }))
    const { jobs, manager } = fakeManager()
    start(manager)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].calls).toEqual([
      ['phase', 'decode'],
      ['progress', 1, { done: 500, unit: 'points' }],
      ['loaded', 'early'],
    ])

    // A COPC is 'ready' at its header with 0 points: no "0 points" counter.
    pc().addCloud(cloud({ id: 'copc', format: 'copc', status: 'ready', progress: 100, pointCount: 0 }))
    expect(jobs[1].calls).toEqual([['phase', 'decode'], ['progress', 1, undefined], ['loaded', 'copc']])
  })

  it('a COPC torn down after its header closes the loaded row and opens a failed one', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    pc().addCloud(cloud({ id: 'copc', format: 'copc' }))
    pc().updateCloud('copc', { status: 'ready', progress: 100 })
    pc().updateCloud('copc', { status: 'error', errorKey: 'error.copcDecode', progress: 0 })

    expect(jobs).toHaveLength(2)
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['removed'])
    expect(jobs[1].spec.resultId).toBe('copc')
    expect(jobs[1].calls).toEqual([['phase', 'decode'], ['failed', { code: 'parse', message: 'error.copcDecode' }]])
  })

  it('a temporal replay is a live source, not a load: never tracked', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    pc().addCloud(cloud({ id: 'replay', sourceKind: 'temporal-replay', status: 'ready', progress: 100, pointCount: 9 }))
    pc().removeCloud('replay')
    expect(jobs).toHaveLength(0)
  })

  it('onCancel runs the cancel dep, then drops the store entry once — which closes the row', () => {
    const { jobs, manager } = fakeManager()
    const cancelPointCloud = vi.fn()
    start(manager, { cancelPointCloud })
    pc().addCloud(cloud({ id: 'a' }))
    pc().addCloud(cloud({ id: 'b' }))

    const epoch = pc().epoch
    jobs[0].spec.onCancel?.()
    expect(cancelPointCloud).toHaveBeenCalledWith('a')
    expect(pc().clouds.map((c) => c.id)).toEqual(['b'])
    expect(pc().epoch).toBe(epoch + 1)
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['cancelled'])

    // A wrapper that already removed the entry: no second epoch bump.
    const sync = vi.fn((id: string) => pc().removeCloud(id))
    const other = fakeManager()
    stops.forEach((s) => s())
    stops = []
    start(other.manager, { cancelPointCloud: sync })
    const bumped = pc().epoch
    other.jobs[0].spec.onCancel?.()
    expect(sync).toHaveBeenCalledWith('b')
    expect(pc().clouds).toHaveLength(0)
    expect(pc().epoch).toBe(bumped + 1)
  })

  it('without a cancel dep the row is view-only, and a throwing dep still drops the entry', () => {
    const plain = fakeManager()
    start(plain.manager)
    pc().addCloud(cloud({ id: 'a' }))
    expect(plain.jobs[0].spec.onCancel).toBeUndefined()
    stops.forEach((s) => s())
    stops = []

    const { jobs, manager } = fakeManager()
    start(manager, { cancelPointCloud: () => { throw new Error('chunk failed to load') } })
    jobs[0].spec.onCancel?.()
    expect(pc().clouds).toHaveLength(0)
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['cancelled'])
  })

  it('a failing manager never breaks the store write it is watching', () => {
    const manager = { track: (): ExternalJobController => { throw new Error('boom') } }
    start(manager)
    expect(() => pc().addCloud(cloud({ id: 'a' }))).not.toThrow()
    expect(pc().clouds).toHaveLength(1)
  })
})

// ── Meshes ────────────────────────────────────────────────────────────────────

describe('external tracking — meshes', () => {
  it('loading → ready → removed, activity only (no fraction), onCancel → removeMesh', () => {
    const { jobs, manager } = fakeManager()
    const removeMesh = vi.fn((id: string) => ms().removeMesh(id))
    start(manager, { removeMesh })

    ms().addMesh(mesh({ id: 'm1' }))
    expect(jobs[0].spec).toMatchObject({
      kind: 'mesh', fileName: 'm1.glb', sizeBytes: 2_000_000, resultId: 'm1', plan: [{ id: 'decode', weight: 1 }],
    })
    ms().updateMesh('m1', { status: 'ready' })
    expect(jobs[0].calls).toEqual([['phase', 'decode'], ['loaded', 'm1']])

    jobs[0].spec.onCancel?.()
    expect(removeMesh).toHaveBeenCalledWith('m1')
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['removed'])
  })

  it('error fails the row; removal while loading cancels it; no dep means no onCancel', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    ms().addMesh(mesh({ id: 'bad' }))
    ms().addMesh(mesh({ id: 'big' }))
    ms().addMesh(mesh({ id: 'gone' }))
    ms().updateMesh('bad', { status: 'error', errorKey: 'error.noGeometry' })
    ms().updateMesh('big', { status: 'error', errorKey: 'error.budgetExhausted' })
    ms().removeMesh('gone')

    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['failed', { code: 'parse', message: 'error.noGeometry' }])
    expect(jobs[1].calls[jobs[1].calls.length - 1]).toEqual(['failed', { code: 'unsupported', message: 'error.budgetExhausted' }])
    expect(jobs[2].calls[jobs[2].calls.length - 1]).toEqual(['cancelled'])
    expect(jobs.every((j) => j.spec.onCancel === undefined)).toBe(true)
  })
})

// ── GIS ───────────────────────────────────────────────────────────────────────

describe('external tracking — GIS context', () => {
  it('terrain loading → ready is one background row named from i18n, with no cancel', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    setTerrain('loading')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].spec).toMatchObject({
      kind: 'gis', fileName: i18n.t('loading:external.terrain'), priority: 4, plan: [{ id: 'fetch', weight: 1 }],
    })
    expect(jobs[0].spec.fileName).not.toMatch(/external\./)   // resolved, not the raw key
    expect(jobs[0].spec.onCancel).toBeUndefined()
    expect(jobs[0].calls).toEqual([['phase', 'fetch']])

    setTerrain('ready')
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['loaded', undefined])

    // Toggled off: what it drew is gone.
    setTerrain('idle')
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['removed'])
    expect(jobs).toHaveLength(1)
  })

  it('buildings: empty is loaded, error fails with network, idle while loading cancels, a refetch replaces', () => {
    const { jobs, manager } = fakeManager()
    start(manager)

    setBuildings('loading')
    setBuildings('empty')
    expect(jobs[0].spec.fileName).toBe(i18n.t('loading:external.buildings'))
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['loaded', undefined])

    setBuildings('loading')                                  // toggled on again: a new fetch
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['removed'])
    setBuildings('error')
    expect(jobs[1].calls[jobs[1].calls.length - 1]).toMatchObject(['failed', { code: 'network' }])

    setBuildings('loading')
    setBuildings('idle')                                     // map mode left under it
    expect(jobs[2].calls[jobs[2].calls.length - 1]).toEqual(['cancelled'])
    expect(jobs).toHaveLength(3)
  })

  it('both slots in one write (disable / resetForScene) close both rows; unrelated geo writes do nothing', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    useGeoStore.setState({ terrainStatus: 'loading', buildingsStatus: 'loading' })
    expect(jobs.map((j) => j.spec.fileName)).toEqual([
      i18n.t('loading:external.terrain'), i18n.t('loading:external.buildings'),
    ])
    useGeoStore.getState().setPanelOpen(true)
    expect(jobs.every((j) => j.calls.length === 1)).toBe(true)

    useGeoStore.getState().resetForScene()
    expect(jobs.map((j) => j.calls[j.calls.length - 1])).toEqual([['cancelled'], ['cancelled']])
  })

  it('a fetch already running when tracking starts is picked up; a settled one is not', () => {
    useGeoStore.setState({ terrainStatus: 'loading', buildingsStatus: 'ready' })
    const { jobs, manager } = fakeManager()
    start(manager)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].spec.fileName).toBe(i18n.t('loading:external.terrain'))
  })
})

// ── stop() ────────────────────────────────────────────────────────────────────

describe('external tracking — stop', () => {
  it('unsubscribes from every store and cancels nothing', () => {
    const { jobs, manager } = fakeManager()
    const stop = start(manager)
    pc().addCloud(cloud({ id: 'a' }))
    ms().addMesh(mesh({ id: 'm' }))
    setTerrain('loading')
    expect(jobs).toHaveLength(3)
    const before = jobs.map((j) => j.calls.length)

    stop()
    stop()                                                   // idempotent
    expect(jobs.map((j) => j.calls.length)).toEqual(before)  // nothing cancelled on stop

    pc().updateCloud('a', { status: 'ready', progress: 100 })
    pc().addCloud(cloud({ id: 'b' }))
    ms().removeMesh('m')
    setTerrain('ready')
    setBuildings('loading')
    expect(jobs).toHaveLength(3)
    expect(jobs.map((j) => j.calls.length)).toEqual(before)
  })
})

// ── Against the real manager ──────────────────────────────────────────────────

describe('external tracking — real LoadManager', () => {
  function realManager() {
    const policy = createResourcePolicy({
      cores: 8, deviceMemoryGB: 8, crossOriginIsolated: false, mobile: false, heapLimitBytes: null,
    })
    const mgr = new LoadManager({ policy })
    const byResult = (id: string): LoadJobView => {
      const j = mgr.findByResult(id)
      if (!j) throw new Error(`no job for ${id}`)
      return j
    }
    return { mgr, byResult }
  }

  it('Cancel in the center stops the runner, empties the panel and settles the row once', () => {
    const { mgr, byResult } = realManager()
    const cancelPointCloud = vi.fn()
    start(mgr, { cancelPointCloud })

    pc().addCloud(cloud({ id: 'scan' }))
    pc().updateCloud('scan', { progress: 30, pointCount: 100 })
    let j = byResult('scan')
    expect(j).toMatchObject({ kind: 'pointcloud', managed: false, status: 'running', fileName: 'scan.laz' })
    expect(j.capabilities.cancel).toBe(true)
    expect(j.phases[0]).toMatchObject({ id: 'decode', status: 'active', fraction: 0.3, done: 100, unit: 'points' })

    mgr.cancel(j.id)
    expect(cancelPointCloud).toHaveBeenCalledTimes(1)
    expect(pc().clouds).toHaveLength(0)
    j = byResult('scan')
    expect(j.status).toBe('cancelled')
    expect(mgr.getSnapshot().summary).toMatchObject({ active: 0, cancelled: 1 })
    mgr.dispose()
  })

  it('Remove on a loaded cloud goes through the same removal and ends as removed', async () => {
    const { mgr, byResult } = realManager()
    const cancelPointCloud = vi.fn()
    start(mgr, { cancelPointCloud })

    pc().addCloud(cloud({ id: 'scan', status: 'ready', progress: 100, pointCount: 42 }))
    const j = byResult('scan')
    expect(j.status).toBe('loaded')
    expect(j.capabilities.remove).toBe(true)

    await mgr.remove(j.id)
    expect(cancelPointCloud).toHaveBeenCalledWith('scan')
    expect(pc().clouds).toHaveLength(0)
    expect(byResult('scan').status).toBe('removed')
    mgr.dispose()
  })

  it('GIS rows run in the background and cannot be cancelled from the center', () => {
    const { mgr } = realManager()
    start(mgr)
    setBuildings('loading')
    const row = mgr.getSnapshot().jobs[0]
    expect(row).toMatchObject({ kind: 'gis', status: 'running', priority: 4 })
    expect(row.capabilities.cancel).toBe(false)
    setBuildings('ready')
    expect(mgr.getSnapshot().jobs[0].status).toBe('loaded')
    mgr.dispose()
  })
})
